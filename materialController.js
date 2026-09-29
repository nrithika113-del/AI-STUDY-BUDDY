const fs = require("fs");
const path = require("path");

const Material = require("../models/Material");
const { askGemini } = require("../utils/gemini");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

// ==========================================
// HELPER: Extract text from uploaded files
// Supports TXT, PDF and DOCX
// ==========================================

const readFileText = async (filePath) => {
    const extension = path.extname(filePath).toLowerCase();

    if (extension === ".txt") {
        return await fs.promises.readFile(filePath, "utf-8");
    }

    if (extension === ".pdf") {
        const dataBuffer = await fs.promises.readFile(filePath);

        const parser = new PDFParse({ data: dataBuffer });

        try {
            const pdfData = await parser.getText();
            return pdfData.text;
        } finally {
            await parser.destroy();
        }
    }

    if (extension === ".docx") {
        const result = await mammoth.extractRawText({
            path: filePath,
        });

        return result.value;
    }

    throw new Error(
        "Unsupported file format. Upload TXT, PDF or DOCX."
    );
};

// ==========================================
// HELPER: Check material ownership
// ==========================================

const checkMaterialAccess = (material, req) => {
    if (!material || !req.user) {
        return false;
    }

    if (req.user.role === "admin") {
        return true;
    }

    return (
        material.user.toString() ===
        req.user.userId.toString()
    );
};

// ==========================================
// HELPER: Find material and check access
// ==========================================

const getAuthorizedMaterial = async (req, res) => {
    const material = await Material.findById(req.params.id);

    if (!material) {
        res.status(404).json({
            message: "Material not found",
        });

        return null;
    }

    if (!checkMaterialAccess(material, req)) {
        res.status(403).json({
            message: "Access denied",
        });

        return null;
    }

    return material;
};

// ==========================================
// HELPER: Validate Gemini JSON response
// ==========================================

const parseGeminiJSON = (raw) => {
    if (typeof raw !== "string" || !raw.trim()) {
        throw new Error("Empty response from Gemini");
    }

    const clean = raw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    const parsed = JSON.parse(clean);

    if (!Array.isArray(parsed)) {
        throw new Error("Gemini did not return a valid array");
    }

    return parsed;
};

// ==========================================
// HELPER: Validate generated question count
// ==========================================

const getQuestionCount = (value) => {
    const count = Number(value || 5);

    if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > 30
    ) {
        throw new Error(
            "Count must be an integer between 1 and 30"
        );
    }

    return count;
};

// ==========================================
// HELPER: Split material into sentences
// ==========================================

const getMaterialSentences = (content) => {
    if (typeof content !== "string" || !content.trim()) {
        return [];
    }

    return content
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+|(?<=;)\s+|(?<=:)\s+/)
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length >= 15);
};

// ==========================================
// HELPER: Detect Gemini quota errors
// ==========================================

const isGeminiQuotaError = (error) => {
    const message = String(
        error?.message || error || ""
    ).toLowerCase();

    const status =
        error?.status ||
        error?.statusCode ||
        error?.code;

    return (
        String(status) === "429" ||
        message.includes("429") ||
        message.includes("resource_exhausted") ||
        message.includes("quota") ||
        message.includes("rate limit")
    );
};

// ==========================================
// HELPER: Local fallback quiz
// Note: Exact-sentence practice, not AI-written MCQs
// ==========================================

const generateFallbackQuiz = (content, count) => {
    const sentences = getMaterialSentences(content);

    if (sentences.length < 4) {
        throw new Error(
            "Not enough readable text to create a local quiz. " +
            "Upload a text-based PDF, DOCX, or TXT with at least " +
            "four readable sentences."
        );
    }

    const quiz = [];

    const selected = sentences.slice(
        0,
        Math.min(count, sentences.length)
    );

    selected.forEach((sentence, index) => {
        const distractors = sentences
            .filter(item => item !== sentence && item.length >= 15)
            .slice(0, 3);

        if (distractors.length < 3) {
            return;
        }

        const options = [
            sentence,
            ...distractors,
        ];

        // Shuffle options
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(
                Math.random() * (i + 1)
            );

            [options[i], options[j]] = [
                options[j],
                options[i],
            ];
        }

        quiz.push({
            question:
                `Which sentence is the selected passage from ` +
                `the material? (Practice ${index + 1})`,

            options,

            answer: sentence,
        });
    });

    if (quiz.length === 0) {
        throw new Error(
            "Unable to create a local quiz. " +
            "Please upload material with more readable sentences."
        );
    }

    return quiz;
};

// ==========================================
// POST /api/materials/upload
// Upload study material
// ==========================================

const uploadMaterial = async (req, res) => {
    let filePath;

    try {
        if (!req.file) {
            return res.status(400).json({
                message: "No file uploaded",
            });
        }

        filePath = req.file.path;

        const { title } = req.body;

        // Extract readable text
        const content = await readFileText(filePath);

        if (!content || !content.trim()) {
            return res.status(400).json({
                message: "The uploaded file contains no readable text",
            });
        }

        // Save material in MongoDB
        const material = await Material.create({
            user: req.user.userId,
            title: title || req.file.originalname,
            content,
            filename: req.file.originalname,
        });

        return res.status(201).json({
            message: "Material uploaded successfully",
            material,
        });

    } catch (error) {
        console.error("Upload Material Error:", error);

        return res.status(500).json({
            message: "Failed to upload material",
            error: error.message,
        });

    } finally {
        // Remove temporary uploaded file
        if (filePath) {
            try {
                await fs.promises.unlink(filePath);
            } catch (error) {
                if (error.code !== "ENOENT") {
                    console.error(
                        "File cleanup error:",
                        error.message
                    );
                }
            }
        }
    }
};

// ==========================================
// GET /api/materials
// Get all materials belonging to user
// ==========================================

const getMaterials = async (req, res) => {
    try {
        const filter =
            req.user.role === "admin"
                ? {}
                : { user: req.user.userId };

        const materials = await Material.find(filter)
            .select(
                "-content -flashcards -quiz -studyPlan"
            )
            .sort({ createdAt: -1 });

        return res.status(200).json(materials);

    } catch (error) {
        console.error("Get Materials Error:", error);

        return res.status(500).json({
            message: "Failed to fetch materials",
        });
    }
};

// ==========================================
// GET /api/materials/:id
// Get single material
// ==========================================

const getMaterial = async (req, res) => {
    try {
        const material = await getAuthorizedMaterial(
            req,
            res
        );

        if (!material) {
            return;
        }

        return res.status(200).json(material);

    } catch (error) {
        console.error("Get Material Error:", error);

        return res.status(500).json({
            message: "Failed to fetch material",
        });
    }
};

// ==========================================
// DELETE /api/materials/:id
// Delete material
// ==========================================

const deleteMaterial = async (req, res) => {
    try {
        const material = await getAuthorizedMaterial(
            req,
            res
        );

        if (!material) {
            return;
        }

        await material.deleteOne();

        return res.status(200).json({
            message: "Material deleted successfully",
        });

    } catch (error) {
        console.error("Delete Material Error:", error);

        return res.status(500).json({
            message: "Failed to delete material",
        });
    }
};

// ==========================================
// POST /api/materials/:id/summarize
// Generate AI summary
// ==========================================

const summarize = async (req, res) => {
    try {
        const material = await getAuthorizedMaterial(
            req,
            res
        );

        if (!material) {
            return;
        }

        const prompt = `
You are an expert study assistant.

Summarize the following study material clearly
and concisely.

Instructions:
1. Use simple and understandable language.
2. Organize the summary into bullet points.
3. Include important concepts and definitions.
4. Do not add information that is not in the material.

Study Material:
${material.content}
`;

        const summary = await askGemini(prompt);

        if (!summary || !summary.trim()) {
            return res.status(500).json({
                message: "Gemini returned an empty summary",
            });
        }

        material.summary = summary;

        await material.save();

        return res.status(200).json({
            message: "Summary generated successfully",
            summary,
        });

    } catch (error) {
        console.error("Summarize Error:", error);

        return res.status(500).json({
            message: "Failed to generate summary",
        });
    }
};

// ==========================================
// POST /api/materials/:id/flashcards
// Generate AI flashcards
// ==========================================

const generateFlashcards = async (req, res) => {
    try {
        const material = await getAuthorizedMaterial(
            req,
            res
        );

        if (!material) {
            return;
        }

        const count = getQuestionCount(req.body.count);

        const prompt = `
You are an expert study assistant.

Create exactly ${count} flashcards based on
the study material below.

Instructions:
1. Questions must be clear and meaningful.
2. Answers must be accurate and concise.
3. Use only the provided study material.
4. Return ONLY a valid JSON array.
5. Do not include Markdown or extra text.

Required JSON format:
[
  {
    "question": "What is ...?",
    "answer": "..."
  }
]

Study Material:
${material.content}
`;

        const raw = await askGemini(prompt);

        const flashcards = parseGeminiJSON(raw);

        // Validate flashcards
        const validFlashcards =
            flashcards.length > 0 &&
            flashcards.every(
                (card) =>
                    typeof card.question === "string" &&
                    typeof card.answer === "string"
            );

        if (!validFlashcards) {
            return res.status(500).json({
                message: "Gemini returned invalid flashcards",
            });
        }

        material.flashcards = flashcards;

        await material.save();

        return res.status(200).json({
            message: "Flashcards generated successfully",
            flashcards,
        });

    } catch (error) {
        console.error(
            "Generate Flashcards Error:",
            error
        );

        return res.status(500).json({
            message: "Failed to generate flashcards",
        });
    }
};

// ==========================================
// POST /api/materials/:id/quiz
// Generate AI multiple choice quiz
// ==========================================

const generateQuiz = async (req, res) => {
    try {
        const material = await getAuthorizedMaterial(
            req,
            res
        );

        if (!material) {
            return;
        }

        const count = getQuestionCount(req.body.count);

        const prompt = `
You are an expert quiz creator.

Create exactly ${count} multiple-choice questions
from the study material below.

Instructions:
1. Each question must have four options.
2. Provide one correct answer.
3. The answer must exactly match one of the options.
4. Use only information from the study material.
5. Return ONLY valid JSON without Markdown.

Required JSON format:
[
  {
    "question": "What is ...?",
    "options": [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    "answer": "Option A"
  }
]

Study Material:
${material.content}
`;

        let quiz;
        let generationMode = "AI";

        try {
            const raw = await askGemini(prompt);

            quiz = parseGeminiJSON(raw);

            // Validate quiz structure
            const validQuiz =
                quiz.length > 0 &&
                quiz.every(
                    (item) =>
                        typeof item.question === "string" &&
                        Array.isArray(item.options) &&
                        item.options.length === 4 &&
                        item.options.every(
                            (option) =>
                                typeof option === "string"
                        ) &&
                        typeof item.answer === "string" &&
                        item.options.includes(item.answer)
                );

            if (!validQuiz) {
                throw new Error(
                    "Gemini returned an invalid quiz format"
                );
            }

        } catch (error) {
            if (!isGeminiQuotaError(error)) {
                throw error;
            }

            console.log(
                "Gemini quota exceeded. " +
                "Creating local exact-sentence practice quiz."
            );

            quiz = generateFallbackQuiz(
                material.content,
                count
            );

            generationMode = "Fallback";
        }

        material.quiz = quiz;

        await material.save();

        return res.status(200).json({
            message: "Quiz generated successfully",
            quiz,
            generationMode,
        });

    } catch (error) {
        console.error(
            "Generate Quiz Error:",
            error
        );

        return res.status(500).json({
            message: "Failed to generate quiz",
        });
    }
};

// ==========================================
// POST /api/materials/:id/study-plan
// Generate personalized AI study plan
// ==========================================

const generateStudyPlan = async (req, res) => {
    try {
        const material = await getAuthorizedMaterial(
            req,
            res
        );

        if (!material) {
            return;
        }

        const {
            goal,
            hoursPerDay,
            days
        } = req.body;

        const studyHours = Number(hoursPerDay || 2);
        const totalDays = Number(days || 7);

        if (
            !Number.isFinite(studyHours) ||
            studyHours <= 0 ||
            studyHours > 12
        ) {
            return res.status(400).json({
                message: "Study hours must be between 0 and 12",
            });
        }

        if (
            !Number.isInteger(totalDays) ||
            totalDays < 1 ||
            totalDays > 90
        ) {
            return res.status(400).json({
                message: "Days must be between 1 and 90",
            });
        }

        const prompt = `
You are an expert study planner.

Create a personalized ${totalDays}-day study plan
based on the provided study material.

Student's goal:
${goal || "Understand and retain the material"}

Available study time:
${studyHours} hours per day.

Instructions:
1. Create a day-by-day schedule.
2. Include topics and learning activities.
3. Include revision and practice questions.
4. Divide the topics into manageable sessions.
5. Use simple, clear language.
6. Cover the important material within the schedule.

Study Material:
${material.content}
`;

        const studyPlan = await askGemini(prompt);

        if (!studyPlan || !studyPlan.trim()) {
            return res.status(500).json({
                message: "Gemini returned an empty study plan",
            });
        }

        material.studyPlan = studyPlan;

        await material.save();

        return res.status(200).json({
            message: "Study plan generated successfully",
            studyPlan,
        });

    } catch (error) {
        console.error(
            "Generate Study Plan Error:",
            error
        );

        return res.status(500).json({
            message: "Failed to generate study plan",
        });
    }
};

// ==========================================
// EXPORT ALL CONTROLLERS
// ==========================================

module.exports = {
    uploadMaterial,
    getMaterials,
    getMaterial,
    deleteMaterial,
    summarize,
    generateFlashcards,
    generateQuiz,
    generateStudyPlan,
};