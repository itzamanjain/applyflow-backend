import express from 'express';
import multer from 'multer';
import { OpenAI } from 'openai';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import dotenv from 'dotenv';
import cors from 'cors';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const upload = multer();

// Middleware
app.use(express.json());
app.use(cors());

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Extract text from PDF function
async function extractPdfText(pdfBuffer) {
    try {
        const data = await pdf(pdfBuffer);
        return data.text;
    } catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error(`Error reading PDF: ${error.message}`);
    }
}

// Ask question using OpenAI API
async function askQuestion(pdfText, question) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are a job seeker talking to a interview and asking simple questions answering questions. 
                    When discussing experience:
                    - Never use phrases like 'based on the resume' or 'according to the provided information'.
                    - Provide specific timeframes whenever available
                    - Calculate and mention the total duration of experience
                    - Include relevant project durations
                    - Be precise about when technologies were used
                    - If exact timeframes aren't available, acknowledge that
                    
                    Format your responses in a natural, conversational way while being specific and direct.
                    Focus on answering exactly what was asked without adding unnecessary information.
                    If information is not available in the resume, clearly state that the specific detail isn't mentioned.`
                },
                {
                    role: "user",
                    content: `PDF Content:\n${pdfText.slice(0, 3000)}\n\nQuestion: ${question}`
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        });

        return response.choices[0].message.content.trim().replace(/\n/g, ' ');
    } catch (error) {
        console.error('OpenAI API error:', error);
        throw new Error(`Error generating answer: ${error.message}`);
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the PDF Question Answering API!' });
});

// PDF upload endpoint
app.post('/upload-pdf', upload.single('file'), async (req, res) => {
    try {
        console.log("file received");
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const pdfText = await extractPdfText(req.file.buffer);
        console.log("pdf text extracted");
        res.json({ 
            pdf_text: pdfText.slice(0, 1000),
            full_text: pdfText // Send full text for later use
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Question answering endpoint
app.post('/ask-question', async (req, res) => {
    try {
        //TODO: get pdf_text from db or some other source (redis,local storage,etc)
        const { question, pdf_text } = req.body;
        console.log("question received");
        if (!question || !pdf_text) {
            return res.status(400).json({ 
                error: 'Both question and pdf_text are required.' 
            });
        }

        const answer = await askQuestion(pdf_text, question);
        res.json({ answer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Something went wrong!',
        message: err.message 
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
