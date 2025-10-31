// This service uses the mammoth.js library, which is expected to be loaded via a script tag in index.html
declare const mammoth: any;

/**
 * Extracts text content from a .docx file.
 * @param file The .docx File object.
 * @returns A promise that resolves with the text content of the document.
 */
export const extractTextFromDocx = async (file: File): Promise<string> => {
    if (typeof mammoth === 'undefined') {
        console.error('mammoth.js library is not loaded.');
        throw new Error('مكتبة قراءة ملفات Word لم يتم تحميلها.');
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            if (!event.target || !event.target.result) {
                return reject('Failed to read file.');
            }
            try {
                const arrayBuffer = event.target.result as ArrayBuffer;
                const result = await mammoth.extractRawText({ arrayBuffer });
                resolve(result.value);
            } catch (error) {
                console.error('Error processing .docx file:', error);
                reject('فشل في معالجة ملف .docx.');
            }
        };
        reader.onerror = () => {
            reject('Error reading file.');
        };
        reader.readAsArrayBuffer(file);
    });
};