import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Template from '@/components/BibPassTemplate';
import { Runner, WebPassConfig } from '@/types';
import { getWalletConfig } from '@/services/supabaseService';
import { generateQrCodeDataUrl, getQrColorFromConfig } from '@/services/bibPassService';
import { DEFAULT_CONFIG } from '@/defaults';
import Button from '@/components/Button';
import LoadingSpinner from '@/components/LoadingSpinner';
import html2canvas from 'html2canvas';
import Cropper from "react-easy-crop";
import type { Area, Point } from 'react-easy-crop';

interface LocationState {
    runner: Runner;
}

function CropBibCard() {
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state as LocationState | null;

    const [runner, setRunner] = useState<Runner | null>(null);
    const [webConfig, setWebConfig] = useState<WebPassConfig>(DEFAULT_CONFIG.web_pass_config!);
    const [bibPassQrCodeUrl, setBibPassQrCodeUrl] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [templateImage, setTemplateImage] = useState<string | null>(null);
    const [isRenderingTemplate, setIsRenderingTemplate] = useState(false);
    const [isTemplateReady, setIsTemplateReady] = useState(false);
    const [isCapturingTemplate, setIsCapturingTemplate] = useState(false);
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [showCropModal, setShowCropModal] = useState(false);
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [cropShape, setCropShape] = useState<'rect' | 'round'>('rect');
    const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
    const [imageScale, setImageScale] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [isCropping, setIsCropping] = useState(false);

    const imageRef = useRef<HTMLImageElement>(null);
    const passContainerRef = useRef<HTMLDivElement>(null);
    const templateContainerRef = useRef<HTMLDivElement | null>(null);
    const hiddenTemplateRef = useRef<HTMLDivElement | null>(null);
    const imageContainerRef = useRef<HTMLDivElement>(null);

    // Initialize runner data
    useEffect(() => {
        if (!state?.runner) {
            setError('Runner data not found. Please search for your bib again.');
            setLoading(false);
            return;
        }
        setRunner(state.runner);
        fetchWebConfig(state.runner);
    }, [state]);

    const renderTemplateAsImage = useCallback(async () => {
        if (!hiddenTemplateRef.current) {
            console.log('❌ hiddenTemplateRef.current is null');
            return;
        }

        if (isRenderingTemplate) {
            console.log('⏳ Already rendering template, skipping...');
            return;
        }

        // รอให้ template พร้อมก่อน (layout adjustments เสร็จแล้ว)
        if (!isTemplateReady) {
            console.log('⏳ Template not ready yet, waiting...');
            return;
        }

        setIsRenderingTemplate(true);
        setIsCapturingTemplate(true); // ตั้งค่า isCapturing เป็น true เพื่อให้ template ใช้ pixel positioning
        try {
            // รอให้แน่ใจว่า DOM update เสร็จแล้ว (รอให้ template re-render ด้วย isCapturing=true)
            await new Promise(resolve => setTimeout(resolve, 800));

            // ตรวจสอบอีกครั้งว่า container มีขนาดแล้ว
            const container = hiddenTemplateRef.current;
            if (!container) {
                console.log('❌ Container lost during wait');
                setIsRenderingTemplate(false);
                setIsCapturingTemplate(false);
                return;
            }

            const containerWidth = container.offsetWidth;
            const containerHeight = container.offsetHeight;

            if (containerWidth === 0 || containerHeight === 0) {
                setIsRenderingTemplate(false);
                setIsCapturingTemplate(false);
                setTimeout(() => renderTemplateAsImage(), 500);
                return;
            }

            // หา BibPassTemplate container ภายใน (element ที่มี class w-[450px])
            let targetElement: HTMLElement | null = null;

            // ลองหา container ที่มี class w-[450px] ก่อน
            const allElements = container.querySelectorAll('*');
            for (const el of allElements) {
                const classList = Array.from<string>(el.classList);
                if (classList.some(cls => cls.includes('w-[') || cls.includes('450px'))) {
                    targetElement = el as HTMLElement;
                    break;
                }
            }

            // ถ้าไม่เจอ ให้ใช้ firstElementChild ที่มีขนาด
            if (!targetElement) {
                const firstChild = container.firstElementChild as HTMLElement;
                if (firstChild && firstChild.offsetWidth > 0) {
                    targetElement = firstChild;
                }
            }

            // ถ้ายังไม่เจอ ให้ใช้ container เอง
            if (!targetElement) {
                targetElement = container;
                console.log('✅ Using container itself as target');
            }

            if (targetElement.offsetWidth === 0 || targetElement.offsetHeight === 0) {
                console.log('❌ Target element has zero size, retrying...');
                setIsRenderingTemplate(false);
                setIsCapturingTemplate(false);
                setTimeout(() => renderTemplateAsImage(), 500);
                return;
            }

            const canvas = await html2canvas(targetElement, {
                backgroundColor: null,
                scale: 2,
                useCORS: true,
                logging: true,
                allowTaint: false,
                width: targetElement.offsetWidth,
                height: targetElement.offsetHeight,
            });

            canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    setTemplateImage(url);
                } else {
                    console.error('❌ Failed to create blob from canvas');
                }
                setIsRenderingTemplate(false);
                setIsCapturingTemplate(false); // รีเซ็ต isCapturing กลับเป็น false
            }, 'image/png');
        } catch (error) {
            console.error('❌ Error rendering template:', error);
            setIsRenderingTemplate(false);
            setIsCapturingTemplate(false); // รีเซ็ต isCapturing กลับเป็น false
        }
    }, [isRenderingTemplate, isTemplateReady]);

    const fetchWebConfig = async (runnerData: Runner) => {
        try {
            const [configResult] = await Promise.all([
                getWalletConfig(),
            ]);

            let selectedConfig: WebPassConfig = DEFAULT_CONFIG.web_pass_config!;

            if (configResult.data) {
                const templates = configResult.data.web_bib_templates || [];
                const rules = configResult.data.template_assignment_rules_bib || [];
                const legacyConfig = configResult.data.web_pass_config;

                if (templates.length > 0) {
                    selectedConfig = templates[0];
                } else if (legacyConfig) {
                    selectedConfig = legacyConfig;
                }

                for (const rule of rules) {
                    if (rule.operator === 'equals') {
                        const runnerValue = String(runnerData[rule.column] || '').trim();
                        const ruleValue = String(rule.value || '').trim();

                        if (runnerValue === ruleValue) {
                            const foundTemplate = templates.find(t => t.id === rule.template_id);
                            if (foundTemplate) {
                                selectedConfig = foundTemplate;
                                break;
                            }
                        }
                    }
                }

                if (runnerData.web_pass_template_id) {
                    const foundTemplate = templates.find(t => t.id === runnerData.web_pass_template_id);
                    if (foundTemplate) {
                        selectedConfig = foundTemplate;
                    }
                }

            }

            const mergedConfig = {
                ...DEFAULT_CONFIG.web_pass_config!,
                ...selectedConfig,
                fields: (selectedConfig.fields && selectedConfig.fields.length > 0)
                    ? selectedConfig.fields
                    : (DEFAULT_CONFIG.web_pass_config?.fields || [])
            };
            setWebConfig(mergedConfig);

            const qrContent = runnerData.qr || `Runner ID: ${runnerData.id} - Bib: ${runnerData.bib}`;
            const qrUrl = await generateQrCodeDataUrl(qrContent, runnerData.colour_sign || '', getQrColorFromConfig(mergedConfig));
            setBibPassQrCodeUrl(qrUrl);

            // Template จะ render เอง และเรียก onLayoutReady เมื่อพร้อม
            // จากนั้นจะ trigger renderTemplateAsImage อัตโนมัติ
        } catch (err: any) {
            console.error('Error fetching config:', err);
            setError('Failed to load template configuration.');
        } finally {
            setLoading(false);
        }
    };

    // Callback เมื่อ template render เสร็จแล้ว
    const handleTemplateLayoutReady = useCallback(() => {
        setIsTemplateReady(true);
    }, []);

    // เมื่อ template ready แล้ว ให้ capture เป็นภาพ
    useEffect(() => {

        if (isTemplateReady && bibPassQrCodeUrl && !templateImage && !isRenderingTemplate) {
            // รอให้แน่ใจว่า hiddenTemplateRef มี element แล้ว
            const attemptCapture = () => {
                if (hiddenTemplateRef.current) {
                    const container = hiddenTemplateRef.current;
                    const hasSize = container.offsetWidth > 0 && container.offsetHeight > 0;
                    if (hasSize) {
                        renderTemplateAsImage();
                    } else {
                        setTimeout(attemptCapture, 300);
                    }
                } else {
                    setTimeout(attemptCapture, 300);
                }
            };

            setTimeout(attemptCapture, 500);
        }
    }, [isTemplateReady, bibPassQrCodeUrl, templateImage, isRenderingTemplate, renderTemplateAsImage]);

    // Fallback: ถ้า template ready แล้วแต่ยังไม่มี image หลังจาก 3 วินาที ให้ลอง capture อีกครั้ง
    // useEffect(() => {
    //     if (isTemplateReady && bibPassQrCodeUrl && !templateImage && !isRenderingTemplate) {
    //         const fallbackTimeout = setTimeout(() => {
    //             console.log('⏰ Fallback: Attempting capture after timeout...');
    //             if (hiddenTemplateRef.current && !templateImage && !isRenderingTemplate) {
    //                 renderTemplateAsImage();
    //             }
    //         }, 3000);

    //         return () => clearTimeout(fallbackTimeout);
    //     }
    // }, [isTemplateReady, bibPassQrCodeUrl, templateImage, isRenderingTemplate, renderTemplateAsImage]);

    // Re-render template when uploadedImage (profile picture) changes
    useEffect(() => {
        if (uploadedImage && isTemplateReady && bibPassQrCodeUrl) {
            setIsTemplateReady(false); // Reset to trigger re-render
            setTimeout(() => {
                renderTemplateAsImage();
            }, 200);
        }
    }, [uploadedImage, isTemplateReady, bibPassQrCodeUrl, renderTemplateAsImage]);

    // Update image container size
    // useEffect(() => {
    //     if (templateContainerRef.current && imageContainerRef.current && uploadedImage) {
    //         const updateSize = () => {
    //             if (templateContainerRef.current && imageContainerRef.current) {
    //                 const rect = templateContainerRef.current.getBoundingClientRect();
    //                 imageContainerRef.current.style.width = `${rect.width}px`;
    //                 imageContainerRef.current.style.height = `${rect.height}px`;
    //             }
    //         };
    //         const timeoutId = setTimeout(updateSize, 200);
    //         window.addEventListener('resize', updateSize);
    //         return () => {
    //             clearTimeout(timeoutId);
    //             window.removeEventListener('resize', updateSize);
    //         };
    //     }
    // }, [templateContainerRef.current, uploadedImage]);

    const createImage = (url: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
            const image = new Image();
            image.addEventListener('load', () => resolve(image));
            image.addEventListener('error', (error) => reject(error));
            image.src = url;
        });

    const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<string> => {
        try {
            const image = await createImage(imageSrc);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                throw new Error('No 2d context');
            }

            canvas.width = pixelCrop.width;
            canvas.height = pixelCrop.height;

            // ถ้าเป็นรูปกลม ให้ crop เป็นวงกลม
            if (cropShape === 'round') {
                // สร้าง clipping path เป็นวงกลม
                ctx.beginPath();
                const centerX = pixelCrop.width / 2;
                const centerY = pixelCrop.height / 2;
                const radius = Math.min(pixelCrop.width, pixelCrop.height) / 2;
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
            }

            ctx.drawImage(
                image,
                pixelCrop.x,
                pixelCrop.y,
                pixelCrop.width,
                pixelCrop.height,
                0,
                0,
                pixelCrop.width,
                pixelCrop.height
            );

            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Failed to create blob'));
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    resolve(url);
                }, 'image/png', 0.95); // เปลี่ยนเป็น PNG เพื่อรองรับความโปร่งใส
            });
        } catch (error) {
            console.error('Error in getCroppedImg:', error);
            throw error;
        }
    };

    const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleCropComplete = async () => {
        if (!originalImage || !croppedAreaPixels) {
            setError('Please wait for the crop area to be calculated.');
            return;
        }

        setIsCropping(true);
        setError(null);
        try {
            const croppedImage = await getCroppedImg(originalImage, croppedAreaPixels);
            setUploadedImage(croppedImage);
            setShowCropModal(false);
            setOriginalImage(null);
            setImagePosition({ x: 0, y: 0 });
            setImageScale(1);
            setCrop({ x: 0, y: 0 });
            setZoom(1);
            setCroppedAreaPixels(null);
            setCropShape('rect'); // รีเซ็ตกลับเป็น rect
            // Note: Template will re-render automatically via useEffect when uploadedImage changes
        } catch (err: any) {
            console.error('Error cropping image:', err);
            setError(`Failed to crop image: ${err.message || 'Unknown error'}`);
        } finally {
            setIsCropping(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                setError('Please upload an image file.');
                return;
            }

            setError(null);
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                if (result) {
                    setOriginalImage(result);
                    setShowCropModal(true);
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                    setCroppedAreaPixels(null);
                }
            };
            reader.onerror = () => {
                setError('Failed to read image file.');
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const handleSaveImage = async () => {
        if (!passContainerRef.current) {
            setError('Cannot save image. Template container not found.');
            return;
        }

        setIsSaving(true);
        try {
            // คำนวณ offset เพื่อปรับตำแหน่งรูปที่ crop ให้ตรงกับที่แสดงผล
            const containerRect = passContainerRef.current.getBoundingClientRect();
            const imageContainer = imageContainerRef.current;
            const templateImg = document.querySelector('.template-image-rendered') as HTMLImageElement;

            // คำนวณ offset เพื่อชดเชยความแตกต่างระหว่างการแสดงผลและ html2canvas
            let offsetX = 0;
            let offsetY = 0;

            if (imageContainer && templateImg) {
                const templateRect = templateImg.getBoundingClientRect();
                const imageContainerRect = imageContainer.getBoundingClientRect();

                // คำนวณ offset จาก container ไปยัง template image
                // template image อาจจะไม่ได้อยู่ที่ตำแหน่ง (0, 0) ของ container
                const templateOffsetX = templateRect.left - containerRect.left;
                const templateOffsetY = templateRect.top - containerRect.top;
                const containerOffsetX = imageContainerRect.left - containerRect.left;
                const containerOffsetY = imageContainerRect.top - containerRect.top;

                // ปรับ offset เพื่อให้รูปที่ crop อยู่ตรงกับ template image
                // html2canvas อาจจะ capture ตำแหน่งไม่ตรงกับที่แสดงผลจริงเล็กน้อย
                offsetX = templateOffsetX - containerOffsetX;
                offsetY = templateOffsetY - containerOffsetY;

                // ปรับเพิ่มเล็กน้อยเพื่อให้ตรงกับที่แสดงผล (ประมาณ 1-3 pixels)
                offsetX += 0;
                offsetY += 0;
            }

            const canvas = await html2canvas(passContainerRef.current, {
                backgroundColor: null,
                scale: 2,
                useCORS: true,
                logging: false,
                onclone: (clonedDoc) => {
                    // ซ่อนกรอบแดงในภาพที่ save
                    const redBorder = clonedDoc.querySelector('.image-border-guide');
                    if (redBorder) {
                        (redBorder as HTMLElement).style.display = 'none';
                    }
                    // ซ่อน resize handle
                    const resizeHandles = clonedDoc.querySelectorAll('.resize-handle');
                    resizeHandles.forEach((handle) => {
                        (handle as HTMLElement).style.display = 'none';
                    });

                    // ปรับตำแหน่งรูปที่ crop ให้ตรงกับที่แสดงผล
                    const clonedImageContainer = clonedDoc.querySelector('.uploaded-image-container') as HTMLElement;
                    if (clonedImageContainer) {
                        const draggableImage = clonedImageContainer.querySelector('.draggable-image') as HTMLElement;
                        if (draggableImage) {
                            const currentLeft = parseFloat(draggableImage.style.left) || imagePosition.x;
                            const currentTop = parseFloat(draggableImage.style.top) || imagePosition.y;

                            // ปรับตำแหน่งโดยเพิ่ม offset เพื่อให้ตรงกับที่แสดงผล
                            draggableImage.style.left = `${currentLeft + offsetX}px`;
                            draggableImage.style.top = `${currentTop + offsetY}px`;
                        }
                    }
                }
            });

            canvas.toBlob((blob) => {
                if (!blob) {
                    setError('Failed to generate image.');
                    setIsSaving(false);
                    return;
                }

                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `bib-${runner?.bib || 'card'}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                setIsSaving(false);
            }, 'image/png');
        } catch (err: any) {
            console.error('Error saving image:', err);
            setError('Failed to save image. Please try again.');
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-900">
                <LoadingSpinner message="Loading template..." />
            </div>
        );
    }

    if (error && !runner) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-900 p-4">
                <div className="bg-red-900 text-red-100 p-6 rounded-lg shadow-md max-w-lg text-center">
                    <h2 className="text-2xl font-bold mb-4">Error</h2>
                    <p className="mb-4">{error}</p>
                    <Button onClick={() => navigate('/share')}>Go Back to Search</Button>
                </div>
            </div>
        );
    }

    if (!runner) return null;

    return (
        <div className="min-h-screen bg-gray-900 p-4">
            {/* Crop Modal */}
            {showCropModal && originalImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4">
                    <div className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
                        <h2 className="text-2xl font-bold text-white mb-4">Crop Your Image</h2>
                        <p className="text-sm text-gray-400 mb-4">
                            เลือกรูปทรง ลากเพื่อย้าย ใช้ zoom slider เพื่อปรับขนาด จากนั้นกด Apply Crop
                        </p>

                        {/* Shape Selector */}
                        <div className="mb-4 flex gap-3">
                            <button
                                onClick={() => setCropShape('rect')}
                                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${cropShape === 'rect'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="inline-block">
                                        <rect x="2" y="2" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" />
                                    </svg>
                                    สี่เหลี่ยม
                                </span>
                            </button>
                            <button
                                onClick={() => setCropShape('round')}
                                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${cropShape === 'round'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="inline-block">
                                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
                                    </svg>
                                    วงกลม
                                </span>
                            </button>
                        </div>

                        <div className="relative w-full flex-1" style={{ minHeight: '400px', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                            <Cropper
                                image={originalImage}
                                crop={crop}
                                zoom={zoom}
                                aspect={cropShape === 'round' ? 1 : 4 / 3}
                                cropShape={cropShape}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                            />
                        </div>
                        <div className="mt-4 space-y-4">
                            {/* Zoom Slider */}
                            <div>
                                <label className="block text-sm text-gray-300 mb-2">
                                    ขยาย/ย่อ: {zoom.toFixed(1)}x
                                </label>
                                <input
                                    type="range"
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    value={zoom}
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <Button
                                onClick={() => {
                                    setShowCropModal(false);
                                    setOriginalImage(null);
                                }}
                                className="flex-1 bg-gray-600 hover:bg-gray-700"
                            >
                                ยกเลิก
                            </Button>
                            <Button
                                onClick={handleCropComplete}
                                disabled={isCropping}
                                loading={isCropping}
                                className="flex-1"
                            >
                                {isCropping ? 'กำลังตัด...' : 'ตัดรูป'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto">
                <h1 className="text-center text-3xl font-extrabold mb-8 text-blue-400">Runner Bib</h1>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Preview */}
                    <div className="order-2 lg:order-1">
                        <div
                            ref={passContainerRef}
                            className="relative"
                            style={{
                                width: 'fit-content',
                                margin: '0 auto',
                                position: 'relative',
                                // display: 'inline-block',
                                touchAction: 'none', // ป้องกัน default touch behaviors
                                backgroundColor: 'transparent !important'
                            }}
                        >

                            {/* Template layer (on top) - แสดงเป็น image แทน component */}
                            {templateImage ? (
                                <div style={{ position: 'relative', zIndex: 2, pointerEvents: 'none' }}>
                                    <img
                                        src={templateImage}
                                        alt="Template"
                                        className="template-image-rendered"
                                        style={{
                                            display: 'block',
                                            width: 'auto',
                                            height: 'auto',
                                            maxWidth: '100%',
                                            userSelect: 'none',
                                            objectFit: 'contain'
                                        }}
                                        onLoad={() => {
                                            // เมื่อ template image โหลดเสร็จ ให้อัพเดทขนาด container
                                            if (imageContainerRef.current) {
                                                const templateImg = document.querySelector('.template-image-rendered') as HTMLImageElement;
                                                if (templateImg) {
                                                    const imgWidth = templateImg.naturalWidth || templateImg.offsetWidth;
                                                    const imgHeight = templateImg.naturalHeight || templateImg.offsetHeight;
                                                    // ใช้ natural dimensions เพื่อความแม่นยำ
                                                    imageContainerRef.current.style.width = `${imgWidth}px`;
                                                    imageContainerRef.current.style.height = `${imgHeight}px`;
                                                }
                                            }
                                        }}
                                    />
                                </div>
                            ) : (
                                <div class="flex" style={{ position: 'relative', zIndex: 2, pointerEvents: 'none', height: '50vh' }}>
                                    <div className="flex items-center justify-center text-gray-400">
                                        {isRenderingTemplate ? 'กำลังโหลด...' : isTemplateReady ? 'กำลังตัดรูปภาพ...' : 'กำลังโหลด...'}
                                    </div>
                                </div>
                            )}

                        </div>


                        <div className="mt-8 pt-6 border-t border-gray-700 w-full">
                            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                                <span className="font-medium">Make your run more fun by</span>
                                <a
                                    href="https://racesmart.run"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 font-bold text-white hover:text-blue-400 transition-colors duration-200 group"
                                >
                                    <span>RaceSmart.run</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Right: Controls */}
                    <div className="order-1 lg:order-2">
                        <div className="bg-gray-800 p-6 rounded-lg space-y-6">
                            <div>

                                <h2 className="text-2xl font-bold mb-4">
                                    {`ยินดีต้อนรับ, ${runner.first_name}`}
                                </h2>
                                <p className="text-gray-300 mb-6">
                                </p>

                                <h2 className="text-xl font-bold text-white mb-4">อัพโหลดรูปภาพ</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            เลือกไฟล์รูปภาพ
                                        </label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                            className="block w-full text-sm text-gray-300
                                                file:mr-4 file:py-2 file:px-4
                                                file:rounded-lg file:border-0
                                                file:text-sm file:font-semibold
                                                file:bg-blue-600 file:text-white
                                                hover:file:bg-blue-700
                                                file:cursor-pointer"
                                        />
                                    </div>

                                    {uploadedImage && (
                                        <div className="space-y-2">
                                            <Button
                                                onClick={() => {
                                                    // คำนวณ scale และ position ใหม่ให้เล็กลง 50% จาก template
                                                    if (imageRef.current && templateImage) {
                                                        const imgRect = imageRef.current.getBoundingClientRect();
                                                        const templateImg = document.querySelector('.template-image-rendered') as HTMLImageElement;

                                                        if (templateImg) {
                                                            const templateRect = templateImg.getBoundingClientRect();

                                                            // คำนวณ scale ให้รูปเล็กลง 50% จาก template
                                                            const targetWidth = templateRect.width * 0.5; // 50% ของ template width
                                                            const targetHeight = templateRect.height * 0.5; // 50% ของ template height

                                                            const scaleX = targetWidth / (imgRect.width / imageScale);
                                                            const scaleY = targetHeight / (imgRect.height / imageScale);
                                                            const optimalScale = Math.min(scaleX, scaleY, 1);

                                                            const scaledWidth = (imgRect.width / imageScale) * optimalScale;
                                                            const scaledHeight = (imgRect.height / imageScale) * optimalScale;
                                                            const centerX = (templateRect.width - scaledWidth) / 2;
                                                            const centerY = (templateRect.height - scaledHeight) / 2;

                                                            setImageScale(optimalScale);
                                                            setImagePosition({ x: centerX, y: centerY });
                                                        }
                                                    }
                                                }}
                                                className="w-full"
                                            >
                                                รีเซ็ตตำแหน่งและขนาด
                                            </Button>
                                            <Button
                                                onClick={() => setUploadedImage(null)}
                                                className="w-full bg-red-600 hover:bg-red-700"
                                            >
                                                ลบรูปภาพ
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-700">
                                <Button
                                    onClick={handleSaveImage}
                                    disabled={isSaving || !uploadedImage}
                                    loading={isSaving}
                                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600"
                                >
                                    {isSaving ? 'กำลังบันทึก...' : '💾 บันทึกเป็นรูปภาพ (PNG)'}
                                </Button>
                                {!uploadedImage && (
                                    <p className="mt-2 text-sm text-gray-400 text-center">
                                        กรุณาอัพโหลดรูปภาพก่อนบันทึก
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden Template สำหรับ render เป็นภาพ (ซ่อนไว้นอกหน้าจอ) */}
            {runner && bibPassQrCodeUrl && (
                <div
                    ref={hiddenTemplateRef}
                    style={{
                        position: 'absolute',
                        left: '-10000px',
                        top: '0',
                        width: '450px',
                        height: 'auto',
                        overflow: 'visible',
                        // ไม่ใช้ visibility: hidden หรือ opacity: 0 เพราะ html2canvas อาจ capture ไม่ได้
                        // แค่ย้ายออกนอกหน้าจอ
                    }}
                >
                    <Template
                        runner={runner}
                        config={webConfig}
                        qrCodeUrl={bibPassQrCodeUrl}
                        profilePictureUrl={uploadedImage || undefined}
                        containerRefCallback={(ref) => {
                            templateContainerRef.current = ref;
                        }}
                        onLayoutReady={handleTemplateLayoutReady}
                        isCapturing={isCapturingTemplate}
                    />
                </div>
            )}
        </div>
    );
}

export default CropBibCard;
