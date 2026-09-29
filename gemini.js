
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const askGemini = async (prompt) => {

    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Gemini API key is missing.");
    }

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {

        try {

            const response = await ai.models.generateContent({
                model: "gemini-3.8-flash",
                contents: prompt
            });

            if (!response.text) {
                throw new Error("Gemini returned an empty response.");
            }

            return response.text;

        } catch (error) {

            const errorMessage = String(error.message || error);

            const status = error.status || error.statusCode || error.code;

            console.error(
                `Gemini attempt ${attempt} failed:`,
                error
            );

            // Handle quota errors
            if (
                status === 429 ||
                String(status) === "429" ||
                errorMessage.includes("RESOURCE_EXHAUSTED") ||
                errorMessage.includes("quota")
            ) {
                throw new Error(
                    "GEMINI_QUOTA_EXCEEDED: Gemini API quota exceeded. Please try again after the quota resets."
                );
            }

            // Retry temporary server errors
            const isTemporaryError =
                String(status) === "503" ||
                errorMessage.includes("503") ||
                errorMessage.includes("UNAVAILABLE") ||
                errorMessage.includes("high demand");

            if (!isTemporaryError || attempt === maxAttempts) {
                throw error;
            }

            const delay = attempt * 5000;

            console.log(
                `Retrying Gemini in ${delay / 1000} seconds...`
            );

            await new Promise(resolve =>
                setTimeout(resolve, delay)
            );
        }
    }
};

module.exports = { askGemini };