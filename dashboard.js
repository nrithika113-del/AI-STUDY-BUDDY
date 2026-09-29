
/* ==========================================
   AI STUDY BUDDY
   DASHBOARD JAVASCRIPT
   ========================================== */


/* ==========================================
   1. API CONFIGURATION
   ========================================== */

const API_BASE_URL = "http://localhost:5000/api";


/* ==========================================
   2. GET HTML ELEMENTS
   ========================================== */

const uploadForm = document.getElementById("uploadForm");

const pdfFileInput = document.getElementById("pdfFile");

const uploadMessage = document.getElementById("uploadMessage");


/* ==========================================
   3. DISPLAY UPLOAD MESSAGE
   ========================================== */

function showUploadMessage(message, type) {

    if (!uploadMessage) {
        alert(message);
        return;
    }

    uploadMessage.textContent = message;

    uploadMessage.className = "upload-message";

    if (type === "success") {
        uploadMessage.classList.add("success");
    }

    else if (type === "error") {
        uploadMessage.classList.add("error");
    }

    else {
        uploadMessage.classList.add("loading");
    }

}


/* ==========================================
   4. GET ACCESS TOKEN
   ========================================== */

function getAccessToken() {

    const token = localStorage.getItem("accessToken");

    if (!token) {

        showUploadMessage(
            "Please login again to upload your PDF.",
            "error"
        );

        return null;
    }

    return token;
}


/* ==========================================
   5. VALIDATE PDF FILE
   ========================================== */

function validatePDF(file) {

    if (!file) {

        showUploadMessage(
            "Please select a PDF file.",
            "error"
        );

        return false;
    }

    const fileName = file.name.toLowerCase();

    if (!fileName.endsWith(".pdf")) {

        showUploadMessage(
            "Only PDF files are allowed.",
            "error"
        );

        return false;
    }

    return true;
}


/* ==========================================
   6. UPLOAD PDF
   ========================================== */

async function uploadPDF(event) {

    event.preventDefault();

    console.log("PDF upload started.");

    if (!uploadForm || !pdfFileInput || !uploadMessage) {

        console.error(
            "Upload form elements not found in dashboard.html."
        );

        return;
    }


    /* GET SELECTED FILE */

    const file = pdfFileInput.files[0];

    if (!validatePDF(file)) {
        return;
    }


    /* GET ACCESS TOKEN */

    const accessToken = getAccessToken();

    if (!accessToken) {
        return;
    }


    /* CREATE FORM DATA */

    const formData = new FormData();

    formData.append("file", file);


    /* SHOW LOADING MESSAGE */

    showUploadMessage(
        "Uploading your PDF. Please wait...",
        "loading"
    );


    /* DISABLE UPLOAD BUTTON */

    const submitButton = uploadForm.querySelector(
        'button[type="submit"]'
    );

    if (submitButton) {

        submitButton.disabled = true;

        submitButton.textContent = "Uploading...";

    }


    /* SEND REQUEST TO BACKEND */

    try {

        console.log("Sending request to backend...");

        const response = await fetch(
            `${API_BASE_URL}/materials/upload`,
            {
                method: "POST",

                headers: {
                    "Authorization": "Bearer " + accessToken
                },

                body: formData,

                signal: AbortSignal.timeout(120000)
            }
        );


        /* READ RESPONSE */

        console.log(
            "Response status:",
            response.status
        );

        const responseText = await response.text();

        console.log(
            "Backend response:",
            responseText
        );


        /* CONVERT RESPONSE TO JSON */

        let result = {};

        try {

            result = JSON.parse(responseText);

        }

        catch {

            result = {
                message: responseText
            };

        }


        /* HANDLE SUCCESS */

        if (response.ok) {

            showUploadMessage(
                result.message ||
                "PDF uploaded successfully!",
                "success"
            );

            console.log(
                "Upload successful:",
                result
            );


            /* CLEAR SELECTED FILE */

            uploadForm.reset();


            /* SAVE UPLOAD DETAILS */

            if (result.material) {

                localStorage.setItem(
                    "lastUploadedMaterial",
                    JSON.stringify(result.material)
                );

            }

        }


        /* HANDLE AUTHENTICATION ERROR */

        else if (response.status === 401) {

            showUploadMessage(
                result.message ||
                "Session expired. Please login again.",
                "error"
            );

            console.error(
                "Authentication error:",
                result
            );

        }


        /* HANDLE OTHER SERVER ERRORS */

        else {

            showUploadMessage(
                result.message ||
                "Upload failed. Please try again.",
                "error"
            );

            console.error(
                "Upload failed:",
                response.status,
                result
            );

        }

    }


    /* HANDLE NETWORK ERRORS */

    catch (error) {

        console.error(
            "PDF upload error:",
            error
        );

        if (error.name === "TimeoutError") {

            showUploadMessage(
                "Upload taking too long. Please check backend.",
                "error"
            );

        }

        else if (error.name === "AbortError") {

            showUploadMessage(
                "Upload was cancelled.",
                "error"
            );

        }

        else {

            showUploadMessage(
                "Cannot connect to backend: " +
                error.message,
                "error"
            );

        }

    }


    /* ENABLE BUTTON AGAIN */

    finally {

        if (submitButton) {

            submitButton.disabled = false;

            submitButton.textContent = "Upload PDF";

        }

    }

}

/* ==========================================
   8. LOAD UPLOADED MATERIALS
========================================== */

async function getMaterials() {

    const materialsList = document.getElementById("materialsList");

    if (!materialsList) return;

    const token = localStorage.getItem("accessToken");

    if (!token) {
        materialsList.textContent = "Please login again.";
        return;
    }

    try {

        const response = await fetch(
            `${API_BASE_URL}/materials`,
            {
                headers: {
                    "Authorization": "Bearer " + token
                }
            }
        );

        const result = await response.json();

        if (!response.ok) {
            materialsList.textContent =
                result.message || "Unable to load materials.";
            return;
        }

        const materials = Array.isArray(result)
            ? result
            : result.materials || [];

        materialsList.innerHTML = "";

        if (materials.length === 0) {
            materialsList.textContent =
                "No study materials uploaded yet.";
            return;
        }

        materials.forEach(function(material) {

            const card = document.createElement("div");
            card.className = "material-card";

            const title = document.createElement("h3");
            title.textContent =
                material.title || material.originalName || "Study Material";

            card.appendChild(title);
            const summaryButton = document.createElement("button");

summaryButton.textContent = "Generate AI Summary";

summaryButton.type = "button";

summaryButton.addEventListener("click", async function () {

    summaryButton.disabled = true;
    summaryButton.textContent = "Generating Summary...";

    try {

        const token = localStorage.getItem("accessToken");

        const response = await fetch(
            `${API_BASE_URL}/materials/${material._id}/summarize`,
            {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token
                }
            }
        );

        const result = await response.json();

        if (!response.ok) {
            alert(result.message || "Summary generation failed.");
            return;
        }

        const summaryBox = document.createElement("div");
        summaryBox.className = "summary-result";

        const heading = document.createElement("h4");
        heading.textContent = "AI Summary";

        const content = document.createElement("p");
       const summaryText =
    result.summary ||
    result.material?.summary ||
    "Summary generated, but no summary text was returned.";

// Escape HTML for safety
const safeText = String(summaryText)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Convert Markdown formatting
content.innerHTML = safeText
    .replace(/\\\*\\\*/g, "**")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\\\*/g, "*")
    .replace(/\n/g, "<br>");
        summaryBox.appendChild(heading);
        summaryBox.appendChild(content);

        card.appendChild(summaryBox);

    } catch (error) {

        console.error(error);
        alert("Cannot connect to backend.");

    } finally {

        summaryButton.disabled = false;
        summaryButton.textContent = "Generate AI Summary";

    }

});
// ==========================================
// GENERATE AI FLASHCARDS
// ==========================================

const flashcardsButton = document.createElement("button");

flashcardsButton.textContent = "Generate AI Flashcards";
flashcardsButton.type = "button";

flashcardsButton.addEventListener("click", async function () {

    flashcardsButton.disabled = true;
    flashcardsButton.textContent = "Generating Flashcards...";

    try {

        const token = localStorage.getItem("accessToken");

        const response = await fetch(
            `${API_BASE_URL}/materials/${material._id}/flashcards`,
            {
                method: "POST",

                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    count: 5
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            alert(result.message || "Flashcards generation failed.");
            return;
        }

        const flashcards = result.flashcards || [];

        const flashcardsBox = document.createElement("div");
        flashcardsBox.className = "flashcards-result";

        const heading = document.createElement("h4");
        heading.textContent = "AI Flashcards";

        flashcardsBox.appendChild(heading);

        flashcards.forEach(function (flashcard, index) {

            const flashcardItem = document.createElement("div");
            flashcardItem.className = "flashcard-item";

            const question = document.createElement("h5");
            question.textContent =
                "Q" + (index + 1) + ": " + flashcard.question;

            const answer = document.createElement("p");
            answer.textContent =
                "Answer: " + flashcard.answer;

            flashcardItem.appendChild(question);
            flashcardItem.appendChild(answer);

            flashcardsBox.appendChild(flashcardItem);

        });

        card.appendChild(flashcardsBox);

    } catch (error) {

        console.error("Flashcards Error:", error);
        alert("Cannot connect to backend.");

    } finally {

        flashcardsButton.disabled = false;
        flashcardsButton.textContent = "Generate AI Flashcards";

    }

});
// ==========================================
// GENERATE AI QUIZ
// ==========================================

const quizButton = document.createElement("button");

quizButton.textContent = "Generate AI Quiz";
quizButton.type = "button";

quizButton.addEventListener("click", async function () {

    quizButton.disabled = true;
    quizButton.textContent = "Generating Quiz...";

    try {

        const token = localStorage.getItem("accessToken");

        const response = await fetch(
            `${API_BASE_URL}/materials/${material._id}/quiz`,
            {
                method: "POST",

                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    count: 5
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            alert(result.message || "Quiz generation failed.");
            return;
        }

        const quiz = result.quiz || [];

        const quizBox = document.createElement("div");
        quizBox.className = "quiz-result";

        const heading = document.createElement("h4");
        heading.textContent = "AI Quiz";

        quizBox.appendChild(heading);

        quiz.forEach(function (item, index) {

            const questionBox = document.createElement("div");
            questionBox.className = "quiz-question";

            const question = document.createElement("h5");
            question.textContent =
                "Q" + (index + 1) + ": " + item.question;

            questionBox.appendChild(question);

            item.options.forEach(function (option) {

                const label = document.createElement("label");

                const radio = document.createElement("input");
                radio.type = "radio";
                radio.name = "quiz-" + material._id + "-" + index;
                radio.value = option;

                label.appendChild(radio);
                label.appendChild(
                    document.createTextNode(" " + option)
                );

                questionBox.appendChild(label);
                questionBox.appendChild(
                    document.createElement("br")
                );

            });

            quizBox.appendChild(questionBox);

        });

        const submitButton = document.createElement("button");
        submitButton.textContent = "Submit Quiz";
        submitButton.type = "button";

        submitButton.addEventListener("click", function () {

            let score = 0;

            quiz.forEach(function (item, index) {

                const selected = document.querySelector(
                    `input[name="quiz-${material._id}-${index}"]:checked`
                );

                if (selected && selected.value === item.answer) {
                    score++;
                }

            });

            alert(
                "Your Score: " + score + " / " + quiz.length
            );

        });

        quizBox.appendChild(submitButton);
        card.appendChild(quizBox);

    } catch (error) {

        console.error("Quiz Error:", error);
        alert("Cannot connect to backend.");

    } finally {

        quizButton.disabled = false;
        quizButton.textContent = "Generate AI Quiz";

    }

});
card.appendChild(flashcardsButton);
// ==========================================
// GENERATE AI STUDY PLAN
// ==========================================

const studyPlanButton = document.createElement("button");

studyPlanButton.textContent = "Generate AI Study Plan";
studyPlanButton.type = "button";

studyPlanButton.addEventListener("click", async function () {

    const goal = prompt(
        "What is your study goal?",
        "Understand and revise this material"
    );

    if (goal === null) return;

    const hours = prompt(
        "How many hours can you study per day?",
        "2"
    );

    if (hours === null) return;

    const days = prompt(
        "How many days do you want to study?",
        "7"
    );

    if (days === null) return;

    studyPlanButton.disabled = true;
    studyPlanButton.textContent = "Generating Study Plan...";

    try {

        const token = localStorage.getItem("accessToken");

        const response = await fetch(
            `${API_BASE_URL}/materials/${material._id}/study-plan`,
            {
                method: "POST",

                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    goal: goal,
                    hoursPerDay: Number(hours),
                    days: Number(days)
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            alert(result.message || "Study plan generation failed.");
            return;
        }

        const planBox = document.createElement("div");
        planBox.className = "study-plan-result";

        const heading = document.createElement("h4");
        heading.textContent = "Your AI Study Plan";

        const content = document.createElement("p");
        content.style.whiteSpace = "pre-wrap";
        content.textContent = result.studyPlan || "No study plan returned.";

        planBox.appendChild(heading);
        planBox.appendChild(content);

        card.appendChild(planBox);

    } catch (error) {

        console.error("Study Plan Error:", error);
        alert("Cannot connect to backend.");

    } finally {

        studyPlanButton.disabled = false;
        studyPlanButton.textContent = "Generate AI Study Plan";

    }

});
card.appendChild(quizButton);
card.appendChild(studyPlanButton);
            materialsList.appendChild(card);

        });

    } catch (error) {

        console.error(error);

        materialsList.textContent =
            "Unable to connect to backend.";

    }
}
/* ==========================================
   7. INITIALIZE DASHBOARD
   ========================================== */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        console.log(
            "AI Study Buddy Dashboard Loaded."
        );
        getMaterials();


        if (uploadForm) {

            uploadForm.addEventListener(
                "submit",
                uploadPDF
            );

            console.log(
                "PDF upload form connected."
            );

        }

        else {

            console.error(
                "Upload form not found."
            );
            

        }

    }
);

