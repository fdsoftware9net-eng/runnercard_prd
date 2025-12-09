import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Runner, WebPassConfig } from '../../types';

// ค่าคงที่สำหรับการเขยิบ row_no เมื่อ row เป็นค่าว่าง
const ROW_EMPTY_OFFSET = 12; // px

interface BibPassTemplateProps {
    runner: Runner;
    config: WebPassConfig;
    qrCodeUrl: string; // The main QR code (usually BIB or Verify URL)
    onLayoutReady?: () => void; // Callback when layout adjustments are complete
    containerRefCallback?: (ref: HTMLDivElement | null) => void; // Callback to expose container ref
    isCapturing?: boolean; // Flag to convert percentage to pixel positioning for html2canvas
    profilePictureUrl?: string;
}

// Helper to fill templates
const fillTemplate = (template: string, runner: Runner) => {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        return runner[key as keyof Runner] !== undefined && runner[key as keyof Runner] !== null ? String(runner[key as keyof Runner]) : '';
    });
};

const BibTemplate: React.FC<BibPassTemplateProps> = ({ runner, config, qrCodeUrl, onLayoutReady, containerRefCallback, isCapturing = false,profilePictureUrl }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pixelPositions, setPixelPositions] = useState<{ [key: string]: { left: number; top: number; transform: string } }>({});

    // Expose container ref to parent
    useEffect(() => {
        if (containerRefCallback) {
            containerRefCallback(containerRef.current);
        }
    }, [containerRefCallback]);

    // Calculate pixel positions when capturing
    useEffect(() => {
        if (isCapturing && containerRef.current && config.fields) {
            // Wait for layout to settle and field elements to render
            const timeoutId = setTimeout(() => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const container = containerRef.current;
                        if (!container) return;

                        const containerWidth = container.offsetWidth;
                        const containerHeight = container.offsetHeight;

                        if (containerWidth === 0 || containerHeight === 0) {
                            // Retry if container not ready
                            setTimeout(() => {
                                if (containerRef.current && isCapturing) {
                                    const retryWidth = containerRef.current.offsetWidth;
                                    const retryHeight = containerRef.current.offsetHeight;
                                    if (retryWidth > 0 && retryHeight > 0) {
                                        calculatePixelPositions(retryWidth, retryHeight);
                                    }
                                }
                            }, 100);
                            return;
                        }

                        calculatePixelPositions(containerWidth, containerHeight);
                    });
                });
            }, 200); // Wait 200ms for field elements to render

            return () => clearTimeout(timeoutId);
        } else if (!isCapturing) {
            setPixelPositions({});
        }

        function calculatePixelPositions(containerWidth: number, containerHeight: number) {
            if (!config.fields) return;

            const positions: { [key: string]: { left: number; top: number; transform: string } } = {};

            config.fields.forEach(field => {
                console.log('field', field);
                // Convert percentage to pixels
                const leftPx = (field.x / 100) * containerWidth;
                let topPx = (field.y / 100) * containerHeight;

                // Handle row_no offset first (before general adjustment)
                const isRowNoField = field.key === 'row_no';
                let hasRowNoOffset = false;
                if (isRowNoField) {
                    const rowField = config.fields?.find(f => f.key === 'row');
                    const rowValue = rowField ? runner.row : undefined;
                    const isRowEmpty = rowValue === null || rowValue === undefined || rowValue === '';
                    if (isRowEmpty) {
                        topPx -= ROW_EMPTY_OFFSET + 5;
                        hasRowNoOffset = true;
                    }
                }

                // Adjust top position by -12px when capturing (except QR code, row, and row_no with offset)
                // row and row_no have their own positioning logic, so we don't apply general offset
                if (field.key === 'row' && !(isRowNoField && hasRowNoOffset)) {
                    topPx -= 8;
                }
                // Check if row_no value starts with 'PRE' first - apply -17px only for PRE row_no
                else if (field.key === 'row_no') {
                    const rowNoValue = runner.row_no;
                    if (rowNoValue && String(rowNoValue).startsWith('PRE') && !(isRowNoField && hasRowNoOffset)) {
                        topPx -= 12;
                    } else if (rowNoValue && String(rowNoValue).startsWith('DEFER')) {
                        topPx -= 5;
                    } else if (rowNoValue && String(rowNoValue).startsWith('PACKAGE') && !(isRowNoField && hasRowNoOffset)) {
                        topPx -= 7;
                    } else if (rowNoValue && String(rowNoValue).startsWith('PACER')) {
                        topPx -= 5;
                    } else if (rowNoValue && String(rowNoValue).startsWith('VIP')) {
                        topPx -= 10;
                    } else if (field.toFitType !== 'scale' && !(isRowNoField && hasRowNoOffset)) {
                        topPx -= 25;
                    } else if (field.toFitType === 'scale' && !(isRowNoField && hasRowNoOffset)) {
                        topPx -= 23;
                    }
                }

                else if (field.key === 'qr_code') {
                    topPx -= 0;
                } else if (field.key === 'wave_start') {
                    topPx -= 7;
                } else if (field.key === 'block' || field.key === 'bib' || field.key === 'first_name') {
                    if (field.key === 'block') {
                        console.log('block', field);
                        const blockValue = runner.block;
                        if (blockValue && String(blockValue).startsWith('Defer')) {
                            topPx -= 12;
                        } else if (blockValue && String(blockValue).startsWith('SEMI-ELITE')) {
                            topPx -= 5;
                        } else if (blockValue && String(blockValue).startsWith('REFUND')) {
                            topPx -= 5;
                        } else if (blockValue && String(blockValue).startsWith('PACER')) {
                            topPx -= 10;
                        } else if (blockValue && String(blockValue).startsWith('TFR')) {
                            topPx -= 15;
                        } else {
                            topPx -= 15;
                        }
                    } else {
                        topPx -= 15;
                    }
                }
                else {
                    topPx -= 9;
                }

                // Get field element to calculate actual dimensions for transform
                const fieldElement = fullNameFieldRefs.current[field.id] ||
                    (containerRef.current?.querySelector(`[data-field-id="${field.id}"]`) as HTMLElement);

                let transform = '';
                // if (fieldElement) {
                //   const fieldWidth = fieldElement.offsetWidth || 0;
                //   const fieldHeight = fieldElement.offsetHeight || 0;

                //   // Convert transform to pixel-based
                //   if (field.toFitType === 'fixed') {
                //     transform = `translate(-${fieldWidth}px, -${fieldHeight / 2}px)`;
                //   } else if (field.textAlign === 'center') {
                //     transform = `translate(-${fieldWidth / 2}px, -${fieldHeight / 2}px)`;
                //   } else {
                //     transform = `translate(0, -${fieldHeight / 2}px)`;
                //   }
                // } else {
                //   // Fallback to percentage if element not found (shouldn't happen)
                //   if (field.toFitType === 'fixed') {
                //     transform = 'translate(-100%, -50%)';
                //   } else if (field.textAlign === 'center') {
                //     transform = 'translate(-50%, -50%)';
                //   } else {
                //     transform = 'translate(0, -50%)';
                //   }
                // }

                positions[field.id] = { left: leftPx, top: topPx, transform };
            });

            setPixelPositions(positions);
        }
    }, [isCapturing, config.fields, runner]);

    const fullNameFieldRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

    // State to store adjusted fontSize for fields
    const [fullNameFontSize, setFullNameFontSize] = useState<{ [key: string]: number }>({});
    // State to store truncated content with ellipsis
    const [fullNameContent, setFullNameContent] = useState<{ [key: string]: string }>({});
    // State to store custom styles for wrap mode
    const [fullNameStyle, setFullNameStyle] = useState<{ [key: string]: React.CSSProperties }>({});

    // Track layout adjustments for callback
    const layoutAdjustmentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Helper to schedule layout ready callback after adjustments settle
    const scheduleLayoutReady = useCallback(() => {
        if (!onLayoutReady) return;

        // Clear any existing timeout
        if (layoutAdjustmentTimeoutRef.current) {
            clearTimeout(layoutAdjustmentTimeoutRef.current);
        }

        // Wait for layout adjustments and state updates to settle
        // We wait longer to ensure recursive adjustFontSize calls have completed
        layoutAdjustmentTimeoutRef.current = setTimeout(() => {
            // Additional wait to ensure DOM has fully updated
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    onLayoutReady?.();
                });
            });
        }, 800); // Wait 800ms after last adjustment starts
    }, [onLayoutReady]);

    if (!config) {
        console.error("BibPassTemplate: config is missing");
        return <div className="text-red-500">Error: Configuration missing</div>;
    }

    // Use the configured background color or fallback
    const themeColor = config.backgroundColor || '#ffffff';

    // Helper function to get original content for a field
    const getOriginalContent = (field: any): string => {
        if (field.key === 'custom_text') {
            return field.customText || '';
        } else if (field.key === 'qr_code') {
            return 'QR';
        } else if (field.dataSources && field.dataSources.length > 0) {
            const separator = field.separator !== undefined ? field.separator : ' ';
            return field.dataSources.map((source: any) => {
                if (source === 'custom_text') {
                    return field.customText || '';
                }
                const val = runner[source as keyof Runner];
                return val !== undefined && val !== null ? String(val) : '';
            }).filter((v: string) => v !== '').join(separator);
        } else {
            let content = '';
            const val = runner[field.key as keyof Runner];
            content = val !== undefined && val !== null ? String(val) : '';
            if (field.valueTemplate) {
                content = fillTemplate(field.valueTemplate, runner);
            }
            return content;
        }
    };

    // Call layout ready immediately if no fields need adjustment
    useEffect(() => {
        const hasAdjustments = config.fields?.some(f => f.toFitType === 'scale' || f.toFitType === 'wrap') || false;
        if (!hasAdjustments && onLayoutReady) {
            // No adjustments needed, call ready immediately after initial render
            const timeoutId = setTimeout(() => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        onLayoutReady();
                    });
                });
            }, 100);
            return () => clearTimeout(timeoutId);
        }
    }, [config.fields, onLayoutReady]);

    // วัดความกว้างของ div ที่ให้ปรับขนาด (Scale Mode)
    useEffect(() => {
        const scaleToFitFields = config.fields?.filter(f => f.toFitType === 'scale') || [];
        if (scaleToFitFields.length === 0) return;

        console.log('scaleToFitFields', scaleToFitFields);

        const timeoutIds: NodeJS.Timeout[] = [];
        const imageTimeoutIds: NodeJS.Timeout[] = [];

        const measureAndAdjustField = (field: typeof scaleToFitFields[0]) => {
            const MIN_FONT_SIZE = field.minSize || 10;
            const fieldDiv = fullNameFieldRefs.current[field.id];
            const container = containerRef.current;

            if (!fieldDiv || !container) {
                console.log(`⚠️ Field div or container not found for field ${field.id}`);
                return;
            }

            const containerWidth = container.offsetWidth;
            if (containerWidth === 0) {
                console.log(`⚠️ Container width is 0 for field ${field.id}, retrying...`);
                setTimeout(() => measureAndAdjustField(field), 50);
                return;
            }

            // ตรวจสอบว่า fieldDiv มี style ที่ถูกต้อง (whiteSpace: nowrap) ก่อนวัด
            const computedStyle = window.getComputedStyle(fieldDiv);
            if (computedStyle.whiteSpace !== 'nowrap') {
                console.log(`⚠️ Field ${field.id} whiteSpace is not 'nowrap' yet, retrying...`);
                setTimeout(() => measureAndAdjustField(field), 50);
                return;
            }

            const toFitWidth = field.toFitWidth || containerWidth * 0.9;
            const targetWidth = toFitWidth * 0.9;
            let currentFontSize = field.fontSize;

            console.log(`📏 Field ${field.id}: Starting adjustment with fontSize=${currentFontSize}px, targetWidth=${targetWidth.toFixed(1)}px`);

            const adjustFontSize = () => {
                // ตรวจสอบอีกครั้งว่า fieldDiv ยังอยู่และมี style ที่ถูกต้อง
                const currentFieldDiv = fullNameFieldRefs.current[field.id];
                const currentContainer = containerRef.current;
                if (!currentFieldDiv || !currentContainer) {
                    console.log(`⚠️ Field div or container lost during adjustment for field ${field.id}`);
                    return;
                }

                // ตรวจสอบว่า container width ไม่ได้เปลี่ยนไป
                const currentContainerWidth = currentContainer.offsetWidth;
                if (currentContainerWidth !== containerWidth) {
                    console.log(`⚠️ Container width changed from ${containerWidth}px to ${currentContainerWidth}px for field ${field.id}, remeasuring...`);
                    setTimeout(() => measureAndAdjustField(field), 50);
                    return;
                }

                const currentComputedStyle = window.getComputedStyle(currentFieldDiv);
                if (currentComputedStyle.whiteSpace !== 'nowrap') {
                    console.log(`⚠️ Field ${field.id} whiteSpace changed during adjustment, retrying...`);
                    setTimeout(() => measureAndAdjustField(field), 50);
                    return;
                }

                const fieldWidth = currentFieldDiv.offsetWidth;

                console.log(`📐 Current width: ${fieldWidth.toFixed(1)}px, target: ${targetWidth.toFixed(1)}px, fontSize: ${currentFontSize}px`);

                if (fieldWidth <= targetWidth) {
                    console.log(`✅ Field ${field.id} fits at fontSize=${currentFontSize}px`);

                    if (currentFontSize !== field.fontSize) {
                        setFullNameFontSize(prev => ({
                            ...prev,
                            [field.id]: currentFontSize
                        }));
                    }
                    return;
                }

                if (currentFontSize > MIN_FONT_SIZE) {
                    currentFontSize = Math.max(currentFontSize - 1, MIN_FONT_SIZE);

                    setFullNameFontSize(prev => ({
                        ...prev,
                        [field.id]: currentFontSize
                    }));

                    console.log(`🔽 Reducing fontSize to ${currentFontSize}px for field ${field.id}`);

                    requestAnimationFrame(() => {
                        setTimeout(() => adjustFontSize(), 0);
                    });
                } else {
                    console.log(`⚠️ Font size reached minimum (${MIN_FONT_SIZE}px) for field ${field.id}, applying ellipsis`);
                    applyEllipsis(field, currentFieldDiv);
                }
            };

            adjustFontSize();
        };

        const applyEllipsis = (field: typeof scaleToFitFields[0], fieldDiv: HTMLElement) => {
            const MIN_FONT_SIZE = field.minSize || 10;
            const originalContent = getOriginalContent(field);
            const computedStyle = window.getComputedStyle(fieldDiv);
            const toFitWidth = field.toFitWidth || (containerRef.current?.offsetWidth || 0) * 0.9;
            const maxWidth = toFitWidth * 0.9;

            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.visibility = 'hidden';
            tempDiv.style.whiteSpace = 'nowrap';
            tempDiv.style.fontSize = `${MIN_FONT_SIZE}px`;
            tempDiv.style.fontWeight = field.fontWeight || 'normal';
            tempDiv.style.fontFamily = computedStyle.fontFamily || 'sans-serif';
            document.body.appendChild(tempDiv);

            let left = 0;
            let right = originalContent.length;
            let bestFit = '';

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const testText = originalContent.substring(0, mid) + '';
                tempDiv.textContent = testText;

                if (tempDiv.offsetWidth <= maxWidth) {
                    bestFit = testText;
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            }

            document.body.removeChild(tempDiv);

            setFullNameContent(prev => ({
                ...prev,
                [field.id]: bestFit
            }));

            setFullNameFontSize(prev => ({
                ...prev,
                [field.id]: MIN_FONT_SIZE
            }));

            console.log(`✂️ Applied ellipsis for field ${field.id}: "${bestFit}"`);
        };

        const resetAllFields = () => {
            const fieldsToReset = scaleToFitFields.map(f => f.id);

            if (fieldsToReset.length > 0) {
                setFullNameFontSize(prev => {
                    const updated = { ...prev };
                    fieldsToReset.forEach(fieldId => delete updated[fieldId]);
                    return updated;
                });

                setFullNameContent(prev => {
                    const updated = { ...prev };
                    fieldsToReset.forEach(fieldId => delete updated[fieldId]);
                    return updated;
                });
            }
        };

        const measureAllFields = () => {
            resetAllFields();

            // รอให้ DOM render เสร็จและ layout settle ก่อนวัด โดยเฉพาะเมื่อมี field 'fixed' อยู่ด้วย
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        scaleToFitFields.forEach(field => {
                            measureAndAdjustField(field);
                        });
                        // Schedule layout ready callback after adjustments start
                        scheduleLayoutReady();
                    }, 150); // เพิ่ม delay เป็น 150ms เพื่อให้แน่ใจว่า field 'fixed' render เสร็จแล้ว
                });
            });
        };

        timeoutIds.push(setTimeout(measureAllFields, 150)); // เพิ่ม delay เป็น 150ms

        if (config.backgroundImageUrl) {
            const img = new Image();
            img.onload = () => {
                imageTimeoutIds.push(setTimeout(measureAllFields, 100));
            };
            img.src = config.backgroundImageUrl;
        }

        return () => {
            timeoutIds.forEach(id => clearTimeout(id));
            imageTimeoutIds.forEach(id => clearTimeout(id));
            if (layoutAdjustmentTimeoutRef.current) {
                clearTimeout(layoutAdjustmentTimeoutRef.current);
            }
        };
    }, [config.fields, config.backgroundImageUrl, runner, scheduleLayoutReady]);

    // วัดความกว้างและปรับให้ขึ้นบรรทัดใหม่ (Wrap Mode)
    useEffect(() => {
        const wrapToFitFields = config.fields?.filter(f => f.toFitType === 'wrap') || [];
        if (wrapToFitFields.length === 0) return;

        console.log('wrapToFitFields', wrapToFitFields);

        const timeoutIds: NodeJS.Timeout[] = [];
        const imageTimeoutIds: NodeJS.Timeout[] = [];

        const measureAndAdjustField = (field: typeof wrapToFitFields[0]) => {
            const fieldDiv = fullNameFieldRefs.current[field.id];
            const container = containerRef.current;

            if (!fieldDiv || !container) {
                console.log(`⚠️ Field div or container not found for field ${field.id}`);
                return;
            }

            const containerWidth = container.offsetWidth;
            if (containerWidth === 0) {
                console.log(`⚠️ Container width is 0 for field ${field.id}, retrying...`);
                setTimeout(() => measureAndAdjustField(field), 50);
                return;
            }

            const toFitWidth = field.toFitWidth || containerWidth * 0.9;
            const targetWidth = toFitWidth * 0.9;
            const originalContent = getOriginalContent(field);

            console.log(`📏 Field ${field.id}: Starting wrap adjustment, targetWidth=${targetWidth.toFixed(1)}px`);

            applyWrapping(field, originalContent, targetWidth);
        };

        const applyWrapping = (
            field: typeof wrapToFitFields[0],
            content: string,
            maxWidth: number
        ) => {
            const fieldDiv = fullNameFieldRefs.current[field.id];
            if (!fieldDiv) return;

            setFullNameStyle(prev => ({
                ...prev,
                [field.id]: {
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    maxWidth: `${maxWidth}px`
                }
            }));

            console.log(`📝 Applied wrapping for field ${field.id} with maxWidth=${maxWidth.toFixed(1)}px`);

            requestAnimationFrame(() => {
                setTimeout(() => {
                    checkAndTrimIfNeeded(field, content, maxWidth);
                }, 50);
            });
        };

        const checkAndTrimIfNeeded = (
            field: typeof wrapToFitFields[0],
            content: string,
            maxWidth: number
        ) => {
            const fieldDiv = fullNameFieldRefs.current[field.id];
            if (!fieldDiv) return;

            const fieldWidth = fieldDiv.offsetWidth;

            console.log(`📐 After wrapping - width: ${fieldWidth.toFixed(1)}px, target: ${maxWidth.toFixed(1)}px`);

            if (fieldWidth > maxWidth) {
                console.log(`⚠️ Still exceeds after wrapping, applying ellipsis for field ${field.id}`);
                applyEllipsisWithWrapping(field, content, maxWidth);
            } else {
                console.log(`✅ Field ${field.id} fits with wrapping`);
            }
        };

        const applyEllipsisWithWrapping = (
            field: typeof wrapToFitFields[0],
            originalContent: string,
            maxWidth: number
        ) => {
            const fieldDiv = fullNameFieldRefs.current[field.id];
            if (!fieldDiv) return;

            const computedStyle = window.getComputedStyle(fieldDiv);

            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.visibility = 'hidden';
            tempDiv.style.whiteSpace = 'normal';
            tempDiv.style.wordBreak = 'break-word';
            tempDiv.style.overflowWrap = 'break-word';
            tempDiv.style.fontSize = computedStyle.fontSize || `${field.fontSize}px`;
            tempDiv.style.fontWeight = field.fontWeight || 'normal';
            tempDiv.style.fontFamily = computedStyle.fontFamily || 'sans-serif';
            tempDiv.style.maxWidth = `${maxWidth}px`;
            document.body.appendChild(tempDiv);

            let left = 0;
            let right = originalContent.length;
            let bestFit = '...';

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const testText = originalContent.substring(0, mid) + '...';
                tempDiv.textContent = testText;

                if (tempDiv.offsetWidth <= maxWidth) {
                    bestFit = testText;
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            }

            document.body.removeChild(tempDiv);

            setFullNameContent(prev => ({
                ...prev,
                [field.id]: bestFit
            }));

            console.log(`✂️ Applied ellipsis with wrapping for field ${field.id}: "${bestFit}"`);
        };

        const resetAllFields = () => {
            const fieldsToReset = wrapToFitFields.map(f => f.id);

            if (fieldsToReset.length > 0) {
                setFullNameStyle(prev => {
                    const updated = { ...prev };
                    fieldsToReset.forEach(fieldId => delete updated[fieldId]);
                    return updated;
                });

                setFullNameContent(prev => {
                    const updated = { ...prev };
                    fieldsToReset.forEach(fieldId => delete updated[fieldId]);
                    return updated;
                });
            }
        };

        const measureAllFields = () => {
            resetAllFields();

            setTimeout(() => {
                wrapToFitFields.forEach(field => {
                    measureAndAdjustField(field);
                });
                // Schedule layout ready callback after adjustments start
                scheduleLayoutReady();
            }, 100);
        };

        timeoutIds.push(setTimeout(measureAllFields, 100));

        if (config.backgroundImageUrl) {
            const img = new Image();
            img.onload = () => {
                imageTimeoutIds.push(setTimeout(measureAllFields, 100));
            };
            img.src = config.backgroundImageUrl;
        }

        return () => {
            timeoutIds.forEach(id => clearTimeout(id));
            imageTimeoutIds.forEach(id => clearTimeout(id));
            if (layoutAdjustmentTimeoutRef.current) {
                clearTimeout(layoutAdjustmentTimeoutRef.current);
            }
        };
    }, [config.fields, config.backgroundImageUrl, runner, scheduleLayoutReady]);

    return (
        <>
            <div
                ref={containerRef}
                className="w-[450px] relative font-sans text-gray-800 shadow-2xl mx-auto"
                style={{
                }}
            >
                {/* Background Image - Controls Aspect Ratio */}
                <div style={{ overflow: 'hidden', width: '100%' }}>
                    {config.backgroundImageUrl ? (
                        <img
                            src="https://owcjaxcgeikzogxnoufb.supabase.co/storage/v1/object/public/pass_assets/1765173351088_bib.png"
                            alt="Pass Background"
                            className="w-full h-auto block pointer-events-none"
                            style={{
                                border: 'transparent',
                                borderRadius: '20px',
                            }}
                        />
                    ) : (
                        <div style={{ height: '600px', width: '100%' }} />
                    )}
                </div>

                {/* Dynamic Fields Overlay */}
                <div className="absolute inset-0" style={{ overflow: 'visible' }} translate="no">
                    {config.fields?.map((field) => {
                        let content = '';
                        if (field.key === 'custom_text') {
                            content = field.customText || '';
                        } else if (field.key === 'qr_code') {
                            content = 'QR';
                        } else if (field.dataSources && field.dataSources.length > 0) {
                            const separator = field.separator !== undefined ? field.separator : ' ';
                            content = field.dataSources.map(source => {
                                if (source === 'custom_text') {
                                    return field.customText || '';
                                }
                                const val = runner[source as keyof Runner];
                                return val !== undefined && val !== null ? String(val) : '';
                            }).filter(v => v !== '').join(separator);
                        } else {
                            const val = runner[field.key as keyof Runner];
                            content = val !== undefined && val !== null ? String(val) : '';

                            if (field.valueTemplate) {
                                content = fillTemplate(field.valueTemplate, runner);
                            }
                        }

                        if (field.key === 'qr_code') {
                            const pixelPos = isCapturing && pixelPositions[field.id]
                                ? pixelPositions[field.id]
                                : null;

                            return (
                                <div
                                    key={field.id}
                                    style={{
                                        position: 'absolute',
                                        left: pixelPos ? `${pixelPos.left}px` : `${field.x}%`,
                                        top: pixelPos ? `${pixelPos.top}px` : `${field.y}%`,
                                        width: field.width ? `${field.width}%` : 'auto',
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                >
                                    {qrCodeUrl && <img src={qrCodeUrl} alt="QR" style={{ width: `${field.fontSize * 4}px`, height: 'auto' }} />}
                                </div>
                            );
                        }
                        console.log('field.key', field.key);
                        if (field.key === 'profile_picture') {
                            const pixelPos = isCapturing && pixelPositions[field.id]
                                ? pixelPositions[field.id]
                                : null;

                            const profileWidth = field.profileWidth || 100;
                            const profileHeight = field.profileHeight || 100;
                            // Use placeholder image for preview
                            const profileUrl = field.profilePicture || `https://placehold.co/600x400`;
                            const profileShape = field.profileShape || 'circle';

                            return (
                                <img
                                    src={profileUrl}
                                    alt="Profile"
                                    style={{
                                        position: 'absolute',
                                        left: pixelPos ? `${pixelPos.left}px` : `${field.x}%`,
                                        top: pixelPos ? `${pixelPos.top}px` : `${field.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                        width: `${profileWidth}px`,
                                        height: `${profileHeight}px`,
                                        zIndex: -1,
                                        borderRadius: profileShape === 'circle' ? '50%' : '0',
                                    }}
                                />
                            );
                        }

                        // Calculate dynamic settings based on toFitType
                        let fontSize = field.fontSize;
                        let displayContent = content;
                        let customStyle: React.CSSProperties = {};

                        // Handle scale mode
                        if (field.toFitType === 'scale') {
                            fontSize = fullNameFontSize[field.id] || field.fontSize;
                            if (fullNameContent[field.id]) {
                                displayContent = fullNameContent[field.id];
                            }
                        }

                        // Handle wrap mode
                        if (field.toFitType === 'wrap') {
                            customStyle = fullNameStyle[field.id] || {};
                            if (fullNameContent[field.id]) {
                                displayContent = fullNameContent[field.id];
                            }
                        }

                        // Create ref for fields that need measurement
                        const needsRef = field.toFitType === 'scale' || field.toFitType === 'wrap';
                        // Also store ref for all fields when capturing
                        const needsRefForCapture = isCapturing;

                        // Use pixel positions when capturing
                        const pixelPos = isCapturing && pixelPositions[field.id]
                            ? pixelPositions[field.id]
                            : null;


                        // ตรวจสอบ field row และปรับ row_no position ถ้าจำเป็น
                        const rowField = config.fields?.find(f => f.key === 'row');
                        const isRowNoField = field.key === 'row_no';
                        const rowValue = rowField ? runner.row : undefined;
                        const isRowEmpty = rowValue === null || rowValue === undefined || rowValue === '';

                        let topPosition = pixelPos ? `${pixelPos.top}px` : `${field.y}%`;
                        if (!pixelPos && isRowNoField && isRowEmpty) {
                            topPosition = `calc(${field.y}% - ${ROW_EMPTY_OFFSET}px)`;
                        }

                        // Determine whiteSpace behavior
                        let whiteSpace: React.CSSProperties['whiteSpace'] = 'pre-wrap';
                        if (field.toFitType === 'scale') {
                            whiteSpace = 'nowrap';
                        } else if (field.toFitType === 'wrap') {
                            whiteSpace = customStyle.whiteSpace || 'normal';
                        } else if (field.toFitType === 'fixed') {
                            whiteSpace = 'nowrap';
                        }
                        console.log('displayContent', displayContent);
                        if (displayContent === 'N/A') {
                            displayContent = '';
                        }
                        return (
                            <div
                                key={field.id}
                                data-field-id={field.id}
                                ref={el => {
                                    if (needsRef || needsRefForCapture) {
                                        fullNameFieldRefs.current[field.id] = el;
                                    }
                                }}
                                style={{
                                    position: 'absolute',
                                    left: pixelPos ? `${pixelPos.left}px` : `${field.x}%`,
                                    fontFamily: field.fontFamily,
                                    top: topPosition,
                                    fontSize: `${fontSize}px`,
                                    color: field.color,
                                    fontWeight: field.fontWeight,
                                    textAlign: field.toFitType === 'fixed' ? 'right' : field.textAlign,
                                    whiteSpace: whiteSpace,
                                    overflow: 'visible',
                                    transform: field.toFitType === 'fixed' ? 'translate(-100%, -50%)' : (field.textAlign === 'center' ? 'translate(-50%, -50%)' : 'translate(0, -50%)'),
                                    lineHeight: 1.2,
                                    ...customStyle, // Apply custom styles from wrap mode
                                }}
                            >
                                {displayContent}
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
};

export default BibTemplate;