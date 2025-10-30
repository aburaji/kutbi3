
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { analyzeTextContent, summarizeContent, createQuiz, generateBookDescription, extractBookTitle, analyzeSentiment, extractKeywords, translateToEnglish, translateToArabic, generateScriptFromInfo, generateVideoDescription, generateContentSuggestions, designArticleFromContent, rateContent } from './services/geminiService.ts';
import { extractTextFromPdf, renderPdfFirstPageToDataUrl } from './services/pdfService.ts';
import { extractTextFromDocx } from './services/wordService.ts';
import { extractTextFromEpub } from './services/epubService.ts';
import { createCoverFromText } from './services/coverService.ts';
import Header from './components/Header.tsx';
import ErrorDisplay from './components/ErrorDisplay.tsx';
import BookSelector from './components/BookSelector.tsx';
import { books as initialBooks, researches as initialResearches, periodicals as initialPeriodicals, videos as initialVideos } from './data/books.ts';
import { Book, QuizQuestion, QuizResult, SentimentResult, Note, Video, Audio, Image } from './types.ts';
import { getDbService } from './services/dbService.ts';
import Spinner from './components/Spinner.tsx';

// New Components
import Tabs from './components/Tabs.tsx';
// FIX: Reverted from lazy loading to static imports. Lazy loading can be unreliable in no-build-step environments and was likely causing the white screen issue. Direct imports are more robust.
import VideoSelector from './components/VideoSelector.tsx';
import AudioSelector from './components/AudioSelector.tsx';
import ImageSelector from './components/ImageSelector.tsx';
import AddMediaModal, { MediaType } from './components/AddBookModal.tsx';
import Carousel from './components/Carousel.tsx';
import AnalysisResult from './components/AnalysisResult.tsx';
import InteractiveQuiz from './components/InteractiveQuiz.tsx';
import DeleteConfirmationModal from './components/DeleteConfirmationModal.tsx';
import { Footer } from './components/Footer.tsx';
import AddNoteModal from './components/AddNoteModal.tsx';
import NotesListModal from './components/NotesListModal.tsx';
import WebsiteViewer from './components/WebsiteViewer.tsx';
import ScriptViewerModal from './components/ScriptViewerModal.tsx';
import AboutUs from './components/AboutUs.tsx';
import SupabaseReadiness from './components/SupabaseReadiness.tsx';


/**
 * Extracts the YouTube video ID from a YouTube URL.
 * @param url The YouTube URL.
 * @returns The video ID or null if not found.
 */
const extractYouTubeID = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

/**
 * Generates a thumbnail from a video file.
 * @param file The video file.
 * @returns A promise that resolves with a data URL of the thumbnail.
 */
const generateVideoThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
            return reject('Could not get canvas context');
        }

        video.onloadedmetadata = () => {
            // Seek to a frame, e.g., 1 second in.
            video.currentTime = 1;
        };

        video.onseeked = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            URL.revokeObjectURL(video.src);
            resolve(dataUrl);
        };

        video.onerror = (e) => {
            URL.revokeObjectURL(video.src);
            console.error('Video load error for thumbnail:', e);
            reject('Error loading video file for thumbnail generation.');
        };
        
        video.src = URL.createObjectURL(file);
        video.load();
    });
};

const initialBookIds = new Set(initialBooks.map(b => b.id));
const initialResearchIds = new Set(initialResearches.map(b => b.id));
const initialPeriodicalIds = new Set(initialPeriodicals.map(b => b.id));
const initialVideoIds = new Set(initialVideos.map(v => v.id));

type ActiveTab = 'books' | 'researches' | 'periodicals' | 'videos' | 'audios' | 'images' | 'websites' | 'about' | 'deployment';
type MediaItem = Book | Video | Audio | Image;
type FileType = 'pdf' | 'epub' | 'docx' | 'txt' | 'unknown';


const applyRandomRatingIncrement = (booksToUpdate: Book[]): Book[] => {
    return booksToUpdate.map(book => {
        if (book.ratingCount) {
            const randomIncrement = Math.floor(Math.random() * 3) + 1; 
            return { ...book, ratingCount: book.ratingCount + randomIncrement };
        }
        return book;
    });
};

const applyRandomRatingIncrementForVideos = (videosToUpdate: Video[]): Video[] => {
    return videosToUpdate.map(video => {
        if (video.ratingCount) {
            const randomIncrement = Math.floor(Math.random() * 3) + 1; 
            return { ...video, ratingCount: video.ratingCount + randomIncrement };
        }
        return video;
    });
};

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('books');

    // Media States
    const [books, setBooks] = useState<Book[]>([]);
    const [researches, setResearches] = useState<Book[]>([]);
    const [periodicals, setPeriodicals] = useState<Book[]>([]);
    const [videos, setVideos] = useState<Video[]>([]);
    const [audios, setAudios] = useState<Audio[]>([]);
    const [images, setImages] = useState<Image[]>([]);

    // Analysis & UI States
    const [analysis, setAnalysis] = useState<string>('');
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
    const [isDesigningArticle, setIsDesigningArticle] = useState<boolean>(false);
    const [isRating, setIsRating] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [analyzedItemTitle, setAnalyzedItemTitle] = useState<string | null>(null);
    const [analyzingItemId, setAnalyzingItemId] = useState<string | null>(null);
    const [currentItemContent, setCurrentItemContent] = useState<string | null>(null);
    const [showFollowUpActions, setShowFollowUpActions] = useState<boolean>(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
    const [generatingScriptId, setGeneratingScriptId] = useState<string | null>(null);
    const [isAnalyzedItemUserAdded, setIsAnalyzedItemUserAdded] = useState<boolean>(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingDescId, setEditingDescId] = useState<string | null>(null);
    const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
    const operationRef = useRef(0);

    const [isInQuizMode, setIsInQuizMode] = useState<boolean>(false);
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
    const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
    const [quizQuestionCount, setQuizQuestionCount] = useState<number>(3);
    const [highlightedKeywords, setHighlightedKeywords] = useState<string[]>([]);
    
    // Content Suggestions State
    const [suggestedContent, setSuggestedContent] = useState<(Book | Video)[]>([]);
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState<boolean>(false);


    const [notes, setNotes] = useState<Note[]>([]);
    const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState<boolean>(false);
    const [isNotesListModalOpen, setIsNotesListModalOpen] = useState<boolean>(false);
    const [scriptToView, setScriptToView] = useState<Video | null>(null);

    const featuredContent = [
        initialBooks[0],
        initialVideos[0],
        initialBooks[1]
    ].filter(Boolean);

    // Lazily get the DB service instance. It will be created only once.
    const dbService = getDbService();

    useEffect(() => {
        const loadData = async () => {
            try {
                // Load Books
                const userAddedBooks = await dbService.getAllUserBooks();
                const userAddedBookIds = new Set(userAddedBooks.map(b => b.id));
                const updatedInitialBooks = applyRandomRatingIncrement(initialBooks);
                const filteredInitialBooks = updatedInitialBooks.filter(b => !userAddedBookIds.has(b.id));
                setBooks([...userAddedBooks, ...filteredInitialBooks]);

                // Load Researches
                const userAddedResearches = await dbService.getAllUserResearches();
                const userAddedResearchIds = new Set(userAddedResearches.map(b => b.id));
                const updatedInitialResearches = applyRandomRatingIncrement(initialResearches);
                const filteredInitialResearches = updatedInitialResearches.filter(b => !userAddedResearchIds.has(b.id));
                setResearches([...userAddedResearches, ...filteredInitialResearches]);

                // Load Periodicals
                const userAddedPeriodicals = await dbService.getAllUserPeriodicals();
                const userAddedPeriodicalIds = new Set(userAddedPeriodicals.map(b => b.id));
                const updatedInitialPeriodicals = applyRandomRatingIncrement(initialPeriodicals);
                const filteredInitialPeriodicals = updatedInitialPeriodicals.filter(b => !userAddedPeriodicalIds.has(b.id));
                setPeriodicals([...userAddedPeriodicals, ...filteredInitialPeriodicals]);
                
                // Load Videos
                const userAddedVideos = await dbService.getAllUserVideos();
                const userAddedVideoIds = new Set(userAddedVideos.map(v => v.id));
                const updatedInitialVideos = applyRandomRatingIncrementForVideos(initialVideos);
                const filteredInitialVideos = updatedInitialVideos.filter(v => !userAddedVideoIds.has(v.id));
                setVideos([...userAddedVideos, ...filteredInitialVideos]);

                setAudios(await dbService.getAllUserAudios());
                setImages(await dbService.getAllUserImages());
                setNotes(await dbService.getAllNotes());
    
            } catch (e) {
                console.error("Failed to load data from IndexedDB:", e);
                setError("لم نتمكن من تحميل بياناتك المحفوظة.");
                setBooks(applyRandomRatingIncrement(initialBooks));
                setResearches(applyRandomRatingIncrement(initialResearches));
                setPeriodicals(applyRandomRatingIncrement(initialPeriodicals));
                setVideos(applyRandomRatingIncrementForVideos(initialVideos));
            }
        };
        loadData();
    }, [dbService]);
    
    const resetState = useCallback(() => {
        operationRef.current += 1;
        setAnalysis('');
        setError('');
        setShowFollowUpActions(false);
        setAnalyzedItemTitle(null);
        setAnalyzingItemId(null);
        setCurrentItemContent(null);
        setIsInQuizMode(false);
        setQuizQuestions([]);
        setQuizResult(null);
        setHighlightedKeywords([]);
        setIsAnalyzing(false);
        setSuggestedContent([]);
        setIsGeneratingSuggestions(false);
        setIsSummarizing(false);
        setIsDesigningArticle(false);
        setIsRating(false);
        setIsAnalyzedItemUserAdded(false);
    }, []);
    
    const extractTextFromBookFile = async (file: File): Promise<string> => {
        const fileType = file.type;
        const fileName = file.name.toLowerCase();

        if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
            const objectUrl = URL.createObjectURL(file);
            const text = await extractTextFromPdf(objectUrl);
            URL.revokeObjectURL(objectUrl);
            return text;
        } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
            return await extractTextFromDocx(file);
        } else if (fileType === 'application/epub+zip' || fileName.endsWith('.epub')) {
            return await extractTextFromEpub(file);
        } else if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
            return await file.text();
        } else if (fileName.endsWith('.doc')) {
            throw new Error('ملفات .doc القديمة غير مدعومة. يرجى حفظ الملف بصيغة .docx أولاً.');
        } else {
            throw new Error(`نوع الملف غير مدعوم للتحليل النصي: ${fileType || 'غير معروف'}`);
        }
    };


    const handleAnalyzeItem = useCallback(async (item: MediaItem) => {
        // AI functionality is disabled.
        setError("ميزات التحليل الذكي معطلة حاليًا.");
    }, []);


    const handleSummarize = useCallback(async () => {
        // AI functionality is disabled.
    }, [currentItemContent]);
    
    const handleDesignArticle = useCallback(async () => {
        // AI functionality is disabled.
    }, [currentItemContent]);

    const handleRateContent = useCallback(async () => {
        // AI functionality is disabled.
    }, [currentItemContent]);


    const handleCreateQuiz = useCallback(async (count?: number) => {
        // AI functionality is disabled.
    }, [currentItemContent, quizQuestionCount]);

    const handleQuizComplete = useCallback((answers: (number | null)[]) => {
        let score = 0;
        answers.forEach((answer, index) => {
            if (answer !== null && answer === quizQuestions[index].correctAnswerIndex) {
                score++;
            }
        });
        setQuizResult({ score, total: quizQuestions.length });
        setIsInQuizMode(false);
        setShowFollowUpActions(true);
    }, [quizQuestions]);
    
    const handleAnalyzeSentiment = useCallback(async () => {
        // AI functionality is disabled.
    }, [currentItemContent]);

    const handleExtractKeywords = useCallback(async () => {
        // AI functionality is disabled.
    }, [currentItemContent]);

    const handleTranslate = useCallback(async (targetLanguage: 'en' | 'ar') => {
        // AI functionality is disabled.
    }, [analysis]);
    
    const handleGenerateSuggestions = useCallback(async () => {
        // AI functionality is disabled.
    }, [currentItemContent, books, videos, analyzingItemId]);

    const getFileTypeFromInput = (file: File): FileType => {
        const fileName = file.name.toLowerCase();
        const fileType = file.type;
        if (fileName.endsWith('.pdf') || fileType === 'application/pdf') return 'pdf';
        if (fileName.endsWith('.epub') || fileType === 'application/epub+zip') return 'epub';
        if (fileName.endsWith('.docx') || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
        if (fileName.endsWith('.txt') || fileType === 'text/plain') return 'txt';
        return 'unknown';
    };

    const handleAddMedia = (title: string, description: string, url: string, file: File) => {
        // Step 1: Immediate UI Response
        setIsAddModalOpen(false);
        setError('');
    
        const newId = `user_${Date.now()}`;
    
        // Create placeholder with specific text and isLoading flag
        let placeholder: Book | Video | Audio | Image;
    
        switch (mediaType) {
            case 'book':
            case 'research':
            case 'periodical':
                const newBookPlaceholder: Book = {
                    id: newId, title: 'جارٍ تحديد العنوان...', description: 'جارٍ إنشاء الوصف...',
                    imageUrl: '', isUserAdded: true, isLoading: true, file: file,
                };
                if(mediaType === 'book') setBooks(prev => [newBookPlaceholder, ...prev]);
                else if(mediaType === 'research') setResearches(prev => [newBookPlaceholder, ...prev]);
                else if(mediaType === 'periodical') setPeriodicals(prev => [newBookPlaceholder, ...prev]);
                placeholder = newBookPlaceholder;
                break;
            case 'video':
                const newVideoPlaceholder: Video = {
                    id: newId, title: 'جارٍ تحديد العنوان...', description: 'جارٍ إنشاء الوصف...',
                    thumbnailUrl: '', isUserAdded: true, isLoading: true, file: file,
                };
                setVideos(prev => [newVideoPlaceholder, ...prev]);
                placeholder = newVideoPlaceholder;
                break;
            case 'audio':
                 const newAudioPlaceholder: Audio = {
                    id: newId, title: 'جارٍ تحديد العنوان...', description: 'جارٍ إنشاء الوصف...',
                    thumbnailUrl: '', isUserAdded: true, isLoading: true, file: file,
                };
                setAudios(prev => [newAudioPlaceholder, ...prev]);
                placeholder = newAudioPlaceholder;
                break;
            case 'image':
                 const newImagePlaceholder: Image = {
                    id: newId, title: 'جارٍ تحديد العنوان...', description: 'جارٍ إنشاء الوصف...',
                    url: URL.createObjectURL(file), isUserAdded: true, isLoading: true, file: file,
                };
                setImages(prev => [newImagePlaceholder, ...prev]);
                placeholder = newImagePlaceholder;
                break;
            default:
                // This should not happen
                return;
        }
    
        // Defer heavy processing to allow UI to render the placeholder
        setTimeout(async () => {
            try {
                // Determine if it's a YouTube video early on
                const youtubeUrl = (mediaType === 'video' && file.name === 'YOUTUBE_LINK.txt') ? await file.text() : null;
    
                const finalTitle = title || (youtubeUrl ? "فيديو يوتيوب" : file.name.replace(/\.[^/.]+$/, ""));
                const finalDescription = description || (youtubeUrl ? `فيديو من يوتيوب: ${youtubeUrl}` : `ملف ${mediaType} أضافه المستخدم.`);
    
                const imageUrlPromise = (async () => {
                    if (url) return url;

                    if (mediaType === 'video') {
                        if (youtubeUrl) {
                            const videoId = extractYouTubeID(youtubeUrl);
                            if (videoId) {
                                return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                            }
                        } else if (file.type.startsWith('video/')) {
                            try {
                                return await generateVideoThumbnail(file);
                            } catch (e) {
                                console.error("Failed to generate video thumbnail from file:", e);
                            }
                        }
                        // Fallback placeholder for video
                        return 'https://placehold.co/400x600/334155/ffffff?text=Video';
                    }

                    const objectUrl = URL.createObjectURL(file);
                    try {
                        if (['book', 'research', 'periodical'].includes(mediaType)) {
                            const fileType = getFileTypeFromInput(file);
                            if (fileType === 'pdf') {
                                return await renderPdfFirstPageToDataUrl(objectUrl);
                            }
                             // AI cover generation removed
                        }
                        if (mediaType === 'image') return objectUrl; // Use the file itself as the image
                        if (mediaType === 'audio') return 'https://placehold.co/400x150/166534/ffffff?text=Audio';
                    } catch(e) {
                         console.error("Image generation failed", e);
                    }
                     // Fallback placeholder
                    return 'https://placehold.co/400x600/334155/ffffff?text=Book';
                })();
                
                const finalImageUrl = await imageUrlPromise;
    
                // Step 5: Final Update and Persist
                const commonProps = {
                    ...placeholder,
                    title: finalTitle,
                    description: finalDescription,
                    isLoading: false,
                    downloadUrl: URL.createObjectURL(file),
                    fileName: file.name,
                };
    
                switch (mediaType) {
                    case 'book':
                    case 'research':
                    case 'periodical':
                        const finalBook: Book = { ...commonProps, imageUrl: finalImageUrl || '' };
                        if(mediaType === 'book') {
                            await dbService.addBook(finalBook);
                            setBooks(prev => prev.map(b => b.id === newId ? finalBook : b));
                        } else if(mediaType === 'research') {
                            await dbService.addResearch(finalBook);
                            setResearches(prev => prev.map(b => b.id === newId ? finalBook : b));
                        } else if(mediaType === 'periodical') {
                            await dbService.addPeriodical(finalBook);
                            setPeriodicals(prev => prev.map(b => b.id === newId ? finalBook : b));
                        }
                        break;
                    case 'video':
                         const finalVideo: Video = { ...commonProps, thumbnailUrl: finalImageUrl || '' };
                         await dbService.addVideo(finalVideo);
                         setVideos(prev => prev.map(v => v.id === newId ? finalVideo : v));
                         break;
                    case 'audio':
                         const finalAudio: Audio = { ...commonProps, thumbnailUrl: finalImageUrl || '' };
                         await dbService.addAudio(finalAudio);
                         setAudios(prev => prev.map(a => a.id === newId ? finalAudio : a));
                         break;
                    case 'image':
                         const finalImage: Image = { ...commonProps, url: finalImageUrl || '' };
                         await dbService.addImage(finalImage);
                         setImages(prev => prev.map(i => i.id === newId ? finalImage : i));
                         break;
                }
    
            } catch (e: any) {
                console.error("Failed to add media:", e);
                setError(e.message || `حدث خطأ أثناء إضافة ${mediaType}.`);
                // Always remove placeholder on any error during processing
                switch (mediaType) {
                    case 'book': setBooks(prev => prev.filter(b => b.id !== newId)); break;
                    case 'research': setResearches(prev => prev.filter(b => b.id !== newId)); break;
                    case 'periodical': setPeriodicals(prev => prev.filter(b => b.id !== newId)); break;
                    case 'video': setVideos(prev => prev.filter(v => v.id !== newId)); break;
                    case 'audio': setAudios(prev => prev.filter(a => a.id !== newId)); break;
                    case 'image': setImages(prev => prev.filter(i => i.id !== newId)); break;
                }
            }
        }, 100); // A small delay to ensure UI renders first
    };

    const [mediaType, setMediaType] = useState<MediaType>('book');
    
    const handleOpenAddModal = (type: MediaType) => {
        setMediaType(type);
        setIsAddModalOpen(true);
    };

    const handleSaveEdit = async (id: string, newTitle: string) => {
        try {
            if (activeTab === 'books') {
                const item = books.find(b => b.id === id);
                if (item && item.isUserAdded) await dbService.updateBook({ ...item, title: newTitle });
                setBooks(prev => prev.map(b => b.id === id ? { ...b, title: newTitle } : b));
            } else if (activeTab === 'researches') {
                const item = researches.find(b => b.id === id);
                if (item && item.isUserAdded) await dbService.updateResearch({ ...item, title: newTitle });
                setResearches(prev => prev.map(b => b.id === id ? { ...b, title: newTitle } : b));
            } else if (activeTab === 'periodicals') {
                const item = periodicals.find(b => b.id === id);
                if (item && item.isUserAdded) await dbService.updatePeriodical({ ...item, title: newTitle });
                setPeriodicals(prev => prev.map(b => b.id === id ? { ...b, title: newTitle } : b));
            } else if (activeTab === 'videos') {
                 const video = videos.find(v => v.id === id);
                if (video && video.isUserAdded) await dbService.updateVideo({ ...video, title: newTitle });
                setVideos(prev => prev.map(v => v.id === id ? { ...v, title: newTitle } : v));
            }
        } catch (e) {
            setError('فشل تحديث العنوان.');
        } finally {
            setEditingId(null);
        }
    };
    
    const handleSaveDescEdit = async (id: string, newDescription: string) => {
        try {
            if (activeTab === 'books') {
                const item = books.find(b => b.id === id);
                if (item && item.isUserAdded) await dbService.updateBook({ ...item, description: newDescription });
                setBooks(prev => prev.map(b => b.id === id ? { ...b, description: newDescription } : b));
            } else if (activeTab === 'researches') {
                const item = researches.find(b => b.id === id);
                if (item && item.isUserAdded) await dbService.updateResearch({ ...item, description: newDescription });
                setResearches(prev => prev.map(b => b.id === id ? { ...b, description: newDescription } : b));
            } else if (activeTab === 'periodicals') {
                const item = periodicals.find(b => b.id === id);
                if (item && item.isUserAdded) await dbService.updatePeriodical({ ...item, description: newDescription });
                setPeriodicals(prev => prev.map(b => b.id === id ? { ...b, description: newDescription } : b));
            } else if (activeTab === 'videos') {
                 const video = videos.find(v => v.id === id);
                if (video && video.isUserAdded) await dbService.updateVideo({ ...video, description: newDescription });
                setVideos(prev => prev.map(v => v.id === id ? { ...v, description: newDescription } : v));
            }
        } catch (e) {
            setError('فشل تحديث الوصف.');
        } finally {
            setEditingDescId(null);
        }
    };

    const handleDeleteItem = async () => {
        if (!itemToDelete) return;

        try {
             if (activeTab === 'books') {
                await dbService.deleteBook(itemToDelete.id);
                setBooks(prev => prev.filter(b => b.id !== itemToDelete.id));
            } else if (activeTab === 'researches') {
                await dbService.deleteResearch(itemToDelete.id);
                setResearches(prev => prev.filter(b => b.id !== itemToDelete.id));
            } else if (activeTab === 'periodicals') {
                await dbService.deletePeriodical(itemToDelete.id);
                setPeriodicals(prev => prev.filter(b => b.id !== itemToDelete.id));
            } else if (activeTab === 'videos') {
                await dbService.deleteVideo(itemToDelete.id);
                setVideos(prev => prev.filter(v => v.id !== itemToDelete.id));
            } else if (activeTab === 'audios') {
                await dbService.deleteAudio(itemToDelete.id);
                setAudios(prev => prev.filter(a => a.id !== itemToDelete.id));
            } else if (activeTab === 'images') {
                await dbService.deleteImage(itemToDelete.id);
                setImages(prev => prev.filter(i => i.id !== itemToDelete.id));
            }
        } catch (e) {
            setError(`فشل حذف العنصر: ${itemToDelete.title}`);
        } finally {
            setItemToDelete(null);
        }
    };

    const handleRateItem = async (id: string, rating: number) => {
         try {
            if (activeTab === 'books') {
                const item = books.find(b => b.id === id);
                if (item && item.isUserAdded) await dbService.updateBook({ ...item, rating: rating });
                setBooks(prev => prev.map(b => b.id === id ? { ...b, rating: rating } : b));
            } else if (activeTab === 'researches') {
                const item = researches.find(b => b.id === id);
                if (item && item.isUserAdded) await dbService.updateResearch({ ...item, rating: rating });
                setResearches(prev => prev.map(b => b.id === id ? { ...b, rating: rating } : b));
            } else if (activeTab === 'periodicals') {
                const item = periodicals.find(b => b.id === id);
                if (item && item.isUserAdded) await dbService.updatePeriodical({ ...item, rating: rating });
                setPeriodicals(prev => prev.map(b => b.id === id ? { ...b, rating: rating } : b));
            } else if (activeTab === 'videos') {
                const video = videos.find(v => v.id === id);
                if (video && video.isUserAdded) await dbService.updateVideo({ ...video, rating: rating });
                setVideos(prev => prev.map(v => v.id === id ? { ...v, rating: rating } : v));
            }
        } catch (e) {
            setError('فشل حفظ التقييم.');
        }
    };

    const handleAddNote = async (content: string) => {
        const newNote: Note = {
            id: `note_${Date.now()}`,
            content,
            createdAt: Date.now()
        };
        try {
            await dbService.addNote(newNote);
            setNotes(prev => [newNote, ...prev]);
            setIsAddNoteModalOpen(false);
        } catch (e) {
            setError('فشل حفظ المذكرة.');
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        try {
            await dbService.deleteNote(noteId);
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (e) {
            setError('فشل حذف المذكرة.');
        }
    };

    const handleGenerateScript = useCallback(async (video: Video) => {
        // AI functionality is disabled.
    }, [dbService]);
    
    const currentView = analysis || isInQuizMode;
    const inAnalysisFlow = isAnalyzing || isSummarizing || isDesigningArticle || isRating;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            <main className="container mx-auto px-4 py-8 max-w-5xl">
                <Header />
                <div className="my-8">
                    {error && <ErrorDisplay message={error} />}
                </div>

                {!currentView && !inAnalysisFlow && (
                    <Carousel items={featuredContent} onItemClick={handleAnalyzeItem} />
                )}

                {currentView || inAnalysisFlow ? (
                    <div className="space-y-6">
                        <button
                            onClick={resetState}
                            className="flex items-center gap-2 text-slate-600 font-semibold hover:text-blue-600 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            العودة إلى المكتبة الرئيسية
                        </button>
                        
                        {isInQuizMode ? (
                            <InteractiveQuiz 
                                questions={quizQuestions} 
                                onComplete={handleQuizComplete}
                                bookTitle={analyzedItemTitle || ''}
                            />
                        ) : (
                            <AnalysisResult
                                analysis={analysis}
                                isLoading={isAnalyzing}
                                isSummarizing={isSummarizing}
                                analyzedItemName={analyzedItemTitle}
                                showFollowUpActions={showFollowUpActions}
                                onSummarize={handleSummarize}
                                onCreateQuiz={() => handleCreateQuiz()}
                                onRequestMoreQuestions={() => handleCreateQuiz(quizQuestionCount + 2)}
                                quizResult={quizResult}
                                onAnalyzeSentiment={handleAnalyzeSentiment}
                                onExtractKeywords={handleExtractKeywords}
                                highlightedKeywords={highlightedKeywords}
                                onClearHighlights={() => setHighlightedKeywords([])}
                                onTranslate={handleTranslate}
                                onGenerateSuggestions={handleGenerateSuggestions}
                                isGeneratingSuggestions={isGeneratingSuggestions}
                                suggestedContent={suggestedContent}
                                onGoToLibrary={resetState}
                                onDesignArticle={handleDesignArticle}
                                isDesigningArticle={isDesigningArticle}
                                onRateContent={handleRateContent}
                                isRating={isRating}
                                isAnalyzedItemUserAdded={isAnalyzedItemUserAdded}
                            />
                        )}
                    </div>
                ) : (
                    <>
                        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
                        {activeTab === 'books' && (
                             <BookSelector
                                title="مكتبة الكتب"
                                addButtonText="إضافة كتاب"
                                searchPlaceholder="ابحث عن كتاب بالعنوان أو الوصف..."
                                books={books}
                                onAnalyze={handleAnalyzeItem}
                                isAnalyzing={isAnalyzing}
                                analyzingItemId={analyzingItemId}
                                onOpenAddModal={() => handleOpenAddModal('book')}
                                onOpenNotesListModal={() => setIsNotesListModalOpen(true)}
                                editingId={editingId}
                                onStartEdit={setEditingId}
                                onSaveEdit={handleSaveEdit}
                                editingDescId={editingDescId}
                                onStartDescEdit={setEditingDescId}
                                onSaveDescEdit={handleSaveDescEdit}
                                onDelete={setItemToDelete}
                                onRate={handleRateItem}
                                initialItemIds={initialBookIds}
                            />
                        )}
                        {activeTab === 'researches' && (
                             <BookSelector
                                title="مكتبة البحوث"
                                addButtonText="إضافة بحث"
                                searchPlaceholder="ابحث عن بحث بالعنوان أو الوصف..."
                                books={researches}
                                onAnalyze={handleAnalyzeItem}
                                isAnalyzing={isAnalyzing}
                                analyzingItemId={analyzingItemId}
                                onOpenAddModal={() => handleOpenAddModal('research')}
                                onOpenNotesListModal={() => setIsNotesListModalOpen(true)}
                                editingId={editingId}
                                onStartEdit={setEditingId}
                                onSaveEdit={handleSaveEdit}
                                editingDescId={editingDescId}
                                onStartDescEdit={setEditingDescId}
                                onSaveDescEdit={handleSaveDescEdit}
                                onDelete={setItemToDelete}
                                onRate={handleRateItem}
                                initialItemIds={initialResearchIds}
                            />
                        )}
                         {activeTab === 'periodicals' && (
                             <BookSelector
                                title="مكتبة الدوريات"
                                addButtonText="إضافة دورية"
                                searchPlaceholder="ابحث عن دورية بالعنوان أو الوصف..."
                                books={periodicals}
                                onAnalyze={handleAnalyzeItem}
                                isAnalyzing={isAnalyzing}
                                analyzingItemId={analyzingItemId}
                                onOpenAddModal={() => handleOpenAddModal('periodical')}
                                onOpenNotesListModal={() => setIsNotesListModalOpen(true)}
                                editingId={editingId}
                                onStartEdit={setEditingId}
                                onSaveEdit={handleSaveEdit}
                                editingDescId={editingDescId}
                                onStartDescEdit={setEditingDescId}
                                onSaveDescEdit={handleSaveDescEdit}
                                onDelete={setItemToDelete}
                                onRate={handleRateItem}
                                initialItemIds={initialPeriodicalIds}
                            />
                        )}
                         {activeTab === 'videos' && (
                            <VideoSelector
                                items={videos}
                                onAnalyze={handleAnalyzeItem}
                                isAnalyzing={isAnalyzing}
                                analyzingItemId={analyzingItemId}
                                onOpenAddModal={() => handleOpenAddModal('video')}
                                onOpenNotesListModal={() => setIsNotesListModalOpen(true)}
                                editingId={editingId}
                                onStartEdit={setEditingId}
                                onSaveEdit={handleSaveEdit}
                                editingDescId={editingDescId}
                                onStartDescEdit={setEditingDescId}
                                onSaveDescEdit={handleSaveDescEdit}
                                onDelete={setItemToDelete}
                                onRate={handleRateItem}
                                initialVideoIds={initialVideoIds}
                                onViewScript={setScriptToView}
                                onGenerateScript={handleGenerateScript}
                                generatingScriptId={generatingScriptId}
                            />
                        )}
                        {activeTab === 'audios' && (
                            <AudioSelector 
                                items={audios}
                                onAnalyze={handleAnalyzeItem}
                                isAnalyzing={isAnalyzing}
                                analyzingItemId={analyzingItemId}
                                onOpenAddModal={() => handleOpenAddModal('audio')}
                                onOpenNotesListModal={() => setIsNotesListModalOpen(true)}
                                editingId={editingId} onStartEdit={setEditingId} onSaveEdit={handleSaveEdit}
                                editingDescId={editingDescId} onStartDescEdit={setEditingDescId} onSaveDescEdit={handleSaveDescEdit}
                                onDelete={setItemToDelete} onRate={handleRateItem}
                            />
                        )}
                        {activeTab === 'images' && (
                            <ImageSelector 
                                items={images}
                                onAnalyze={handleAnalyzeItem}
                                isAnalyzing={isAnalyzing}
                                analyzingItemId={analyzingItemId}
                                onOpenAddModal={() => handleOpenAddModal('image')}
                                onOpenNotesListModal={() => setIsNotesListModalOpen(true)}
                                editingId={editingId} onStartEdit={setEditingId} onSaveEdit={handleSaveEdit}
                                editingDescId={editingDescId} onStartDescEdit={setEditingDescId} onSaveDescEdit={handleSaveDescEdit}
                                onDelete={setItemToDelete} onRate={handleRateItem}
                            />
                        )}
                        {activeTab === 'websites' && (
                            <WebsiteViewer />
                        )}
                        {activeTab === 'deployment' && (
                            <SupabaseReadiness />
                        )}
                        {activeTab === 'about' && (
                            <AboutUs />
                        )}
                    </>
                )}
            </main>

            {isAddModalOpen && (
                <AddMediaModal 
                    mediaType={mediaType}
                    onClose={() => setIsAddModalOpen(false)}
                    onAdd={handleAddMedia}
                />
            )}
            {itemToDelete && (
                <DeleteConfirmationModal
                    bookTitle={itemToDelete.title}
                    onConfirm={handleDeleteItem}
                    onCancel={() => setItemToDelete(null)}
                />
            )}
            {isAddNoteModalOpen && (
                <AddNoteModal onClose={() => setIsAddNoteModalOpen(false)} onSave={handleAddNote} />
            )}
            {isNotesListModalOpen && (
                <NotesListModal notes={notes} onClose={() => setIsNotesListModalOpen(false)} onDelete={handleDeleteNote} />
            )}
            {scriptToView && (
                <ScriptViewerModal video={scriptToView} onClose={() => setScriptToView(null)} />
            )}

            {!currentView && !inAnalysisFlow && <Footer />}
        </div>
    );
};

export default App;