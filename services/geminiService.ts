import { QuizQuestion, SentimentResult } from '../types.ts';

// All Gemini functionality has been disabled as per the user's request.
// The functions are kept as stubs to prevent breaking the components that import them.
// They now return default/empty values immediately.

const DISABLED_MESSAGE = "تم تعطيل ميزة الذكاء الاصطناعي.";

export const analyzeTextContent = async (content: string): Promise<{ analysis: string; categories: string[] }> => {
    console.warn("Gemini functionality is disabled.");
    return { analysis: DISABLED_MESSAGE, categories: [] };
};

export const categorizeContent = async (content: string): Promise<string[]> => {
     console.warn("Gemini functionality is disabled.");
     return [];
};


export async function* summarizeContent(content: string): AsyncGenerator<string> {
    console.warn("Gemini functionality is disabled.");
    yield DISABLED_MESSAGE;
    return;
}

export const createQuiz = async (content: string, questionCount: number): Promise<QuizQuestion[]> => {
    console.warn("Gemini functionality is disabled.");
    return [];
};

export const analyzeSentiment = async (content: string): Promise<SentimentResult> => {
    console.warn("Gemini functionality is disabled.");
    return { sentiment: 'محايد', explanation: DISABLED_MESSAGE };
};

export const extractKeywords = async (content: string): Promise<string[]> => {
    console.warn("Gemini functionality is disabled.");
    return [];
};

export const translateToEnglish = async (content: string): Promise<string> => {
    console.warn("Gemini functionality is disabled.");
    return "Translation is disabled.";
};

export const translateToArabic = async (content: string): Promise<string> => {
    console.warn("Gemini functionality is disabled.");
    return "الترجمة معطلة.";
};

export const generateBookDescription = async (content: string): Promise<string> => {
    console.warn("Gemini functionality is disabled.");
    return "تم تعطيل إنشاء الوصف.";
};

export const generateVideoDescription = async (title: string): Promise<string> => {
    console.warn("Gemini functionality is disabled.");
    return "تم تعطيل إنشاء الوصف.";
};

export const extractBookTitle = async (content: string): Promise<string> => {
    console.warn("Gemini functionality is disabled.");
    return "عنوان غير معروف";
};

export const generateScriptFromInfo = async (title: string, description: string): Promise<string> => {
    console.warn("Gemini functionality is disabled.");
    return DISABLED_MESSAGE;
};

export const generateContentSuggestions = async (content: string): Promise<string[]> => {
    console.warn("Gemini functionality is disabled.");
    return [];
};

export const designArticleFromContent = async (content: string): Promise<string> => {
    console.warn("Gemini functionality is disabled.");
    return DISABLED_MESSAGE;
};

export const rateContent = async (content: string): Promise<string> => {
    console.warn("Gemini functionality is disabled.");
    return `### تقييم المحتوى\n\n**التقييم:** ☆☆☆☆☆ (0/5)\n\n**المراجعة:**\n${DISABLED_MESSAGE}`;
};