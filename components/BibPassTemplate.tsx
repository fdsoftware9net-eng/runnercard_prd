import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { Runner, WebPassConfig } from '../types';
import { getCaptureTextOffsetForElement } from '../utils/captureTextOffset';

// ค่าคงที่สำหรับการเขยิบ row_no เมื่อ row เป็นค่าว่าง
const ROW_EMPTY_OFFSET = 12; // px

// Corner radius of the card. The artwork image is rounded by this much, and so
// is anything drawn behind it, so the two must stay in step.
const CARD_CORNER_RADIUS = 20; // px

interface TemplateProps {
  runner: Runner;
  config: WebPassConfig;
  qrCodeUrl: string;
  onLayoutReady?: () => void;
  containerRefCallback?: (ref: HTMLDivElement | null) => void;
  isCapturing?: boolean;
  // Fired once the capture-mode pixel positions are committed to the DOM, i.e.
  // the card is finally laid out the way the saved image should look. The
  // capture waits on this instead of guessing with a fixed delay.
  onCaptureReady?: () => void;
  // The runner's own photo, drawn into the template's 'profile_picture' slot.
  // Its presence is also what switches the card to the cut-out artwork.
  profilePictureUrl?: string;
  // Draws a grey stand-in in an empty photo slot. For the template editors only,
  // where seeing the slot is the point — never on a runner's card, where the
  // stand-in has nothing to show through the artwork but its corners.
  showEmptyPhotoSlot?: boolean;
}

// Shown in the photo slot while no real photo exists — inline so the editor
// never depends on an outside placeholder service to draw the box.
const PHOTO_SLOT_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
    '<rect width="200" height="200" fill="#9ca3af"/>' +
    '<text x="100" y="105" font-family="sans-serif" font-size="16" fill="#f3f4f6" text-anchor="middle">PHOTO</text>' +
    '</svg>'
  );

// ค่าที่ตัวนำเข้าข้อมูลใส่แทนช่องว่าง เป็นแค่ marker ของฝั่ง admin
// ไม่ใช่ข้อความที่นักวิ่งควรเห็นบนการ์ด จึงถือว่าเป็นค่าว่าง
const PLACEHOLDER_VALUES = ['n/a', 'not specified'];

const isPlaceholderValue = (value: string) =>
  PLACEHOLDER_VALUES.includes(value.trim().toLowerCase());

// อ่านค่าจาก runner โดยแปลง null/undefined/placeholder ให้เป็นค่าว่าง
const getRunnerValue = (runner: Runner, key: string): string => {
  const val = runner[key as keyof Runner];
  if (val === undefined || val === null) return '';
  const str = String(val);
  return isPlaceholderValue(str) ? '' : str;
};

// Helper to fill templates
const fillTemplate = (template: string, runner: Runner) => {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => getRunnerValue(runner, key));
};

const BibPassTemplate: React.FC<TemplateProps> = ({ runner, config, qrCodeUrl, onLayoutReady, containerRefCallback, isCapturing = false, onCaptureReady, profilePictureUrl, showEmptyPhotoSlot = false }) => {
  // Two artworks per template: the plain one, and a cut-out one used once the
  // runner has a photo to show through it.
  const backgroundUrl = (profilePictureUrl && config?.backgroundImageUrlWithPhoto)
    ? config.backgroundImageUrlWithPhoto
    : config?.backgroundImageUrl;

  const containerRef = useRef<HTMLDivElement>(null);
  const [pixelPositions, setPixelPositions] = useState<{ [key: string]: { left: number; top: number } }>({});
  // Natural size of each photo slot's image, learned on load. Needed to size the
  // photo to cover its slot by hand — see the 'profile_picture' branch below.
  const [photoNaturalSizes, setPhotoNaturalSizes] = useState<{ [key: string]: { width: number; height: number } }>({});

  // Expose container ref to parent
  useEffect(() => {
    if (containerRefCallback) {
      containerRefCallback(containerRef.current);
    }
  }, [containerRefCallback]);

  // Calculate pixel positions when capturing.
  //
  // useLayoutEffect, and measured straight away, on purpose. This used to sit
  // behind setTimeout(200) + two requestAnimationFrames, which raced the
  // capture's own fixed wait and lost outright whenever frames were slow or
  // not delivered at all (hidden tab, backgrounded webview, busy phone). The
  // capture then photographed the card with these corrections missing and every
  // field came out ~10-20px low. offsetWidth/offsetHeight are layout values and
  // are readable synchronously here, so there is nothing to wait for.
  useLayoutEffect(() => {
    if (isCapturing && containerRef.current && config.fields) {
      const containerWidth = containerRef.current.offsetWidth;
      const containerHeight = containerRef.current.offsetHeight;

      if (containerWidth > 0 && containerHeight > 0) {
        calculatePixelPositions(containerWidth, containerHeight);
        return;
      }

      // Container has no size yet (artwork still loading). Retry on a timer —
      // never on a frame callback, for the reason above.
      const retryId = setTimeout(() => {
        if (containerRef.current) {
          const retryWidth = containerRef.current.offsetWidth;
          const retryHeight = containerRef.current.offsetHeight;
          if (retryWidth > 0 && retryHeight > 0) {
            calculatePixelPositions(retryWidth, retryHeight);
          }
        }
      }, 100);

      return () => clearTimeout(retryId);
    } else if (!isCapturing) {
      setPixelPositions({});
    }

    function calculatePixelPositions(containerWidth: number, containerHeight: number) {
      if (!config.fields) return;
      const container = containerRef.current;

      const positions: { [key: string]: { left: number; top: number } } = {};

      config.fields.forEach(field => {
        // console.log('field', field);
        // Convert percentage to pixels
        const leftPx = (field.x / 100) * containerWidth;
        let topPx = (field.y / 100) * containerHeight;

        // The row_no slot slides up into the gap when there is no row to sit
        // under it. A layout rule, not a capture correction — the preview
        // applies the same shift (see topPosition below), so it belongs here
        // too.
        if (field.key === 'row_no') {
          const rowField = config.fields?.find(f => f.key === 'row');
          const rowValue = rowField ? runner.row : undefined;
          if (rowValue === null || rowValue === undefined || rowValue === '') {
            topPx -= ROW_EMPTY_OFFSET;
          }
        }

        // Pull text up by however far html2canvas is going to push it down.
        // Measured from the field as actually rendered, so it follows the real
        // font and the real size — including whatever a scale-to-fit field
        // shrank to. Image fields (QR, photo, custom image) need nothing:
        // html2canvas places boxes exactly.
        const isTextField = field.key !== 'qr_code'
          && field.key !== 'profile_picture'
          && field.key !== 'custom_image';
        if (isTextField) {
          const fieldEl = container?.querySelector(`[data-field-id="${field.id}"]`) ?? null;
          topPx -= getCaptureTextOffsetForElement(fieldEl);
        }

        positions[field.id] = { left: leftPx, top: topPx };
      });

      setPixelPositions(positions);
    }
  }, [isCapturing, config.fields, runner]);

  // Tell the parent the moment those positions are actually on the elements.
  // Runs in the same commit, before paint, so a capture that waits on this can
  // never photograph the uncorrected layout.
  useLayoutEffect(() => {
    if (!isCapturing || !onCaptureReady) return;
    const expected = config.fields?.length ?? 0;
    if (expected === 0 || Object.keys(pixelPositions).length >= expected) {
      onCaptureReady();
    }
  }, [isCapturing, pixelPositions, config.fields, onCaptureReady]);

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
    console.error("Template: config is missing");
    return <div className="text-red-500">Error: Configuration missing</div>;
  }

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
        return getRunnerValue(runner, source);
      }).filter((v: string) => v !== '').join(separator);
    } else {
      let content = getRunnerValue(runner, field.key);
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
    // Never re-measure mid-capture. A re-run starts by resetting every field to
    // its configured size and then walks the size back down one pixel per
    // frame, so a capture landing in that window photographs text that is too
    // big. The sizes are already settled by the time capture starts — the
    // parent waits for onLayoutReady before it begins — so freezing here costs
    // nothing and removes the race entirely.
    if (isCapturing) return;

    const scaleToFitFields = config.fields?.filter(f => f.toFitType === 'scale') || [];
    if (scaleToFitFields.length === 0) return;

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
        setTimeout(() => measureAndAdjustField(field), 50);
        return;
      }

      // ตรวจสอบว่า fieldDiv มี style ที่ถูกต้อง (whiteSpace: nowrap) ก่อนวัด
      const computedStyle = window.getComputedStyle(fieldDiv);
      if (computedStyle.whiteSpace !== 'nowrap') {
        setTimeout(() => measureAndAdjustField(field), 50);
        return;
      }

      const toFitWidth = field.toFitWidth || containerWidth * 0.9;
      const targetWidth = toFitWidth * 0.9;
      let currentFontSize = field.fontSize;

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
          setTimeout(() => measureAndAdjustField(field), 50);
          return;
        }

        const currentComputedStyle = window.getComputedStyle(currentFieldDiv);
        if (currentComputedStyle.whiteSpace !== 'nowrap') {
          setTimeout(() => measureAndAdjustField(field), 50);
          return;
        }

        const fieldWidth = currentFieldDiv.offsetWidth;

        console.log(`📐 Current width: ${fieldWidth.toFixed(1)}px, target: ${targetWidth.toFixed(1)}px, fontSize: ${currentFontSize}px`);

        if (fieldWidth <= targetWidth) {
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

          requestAnimationFrame(() => {
            setTimeout(() => adjustFontSize(), 0);
          });
        } else {
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

    if (backgroundUrl) {
      const img = new Image();
      img.onload = () => {
        imageTimeoutIds.push(setTimeout(measureAllFields, 100));
      };
      img.src = backgroundUrl;
    }

    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
      imageTimeoutIds.forEach(id => clearTimeout(id));
      if (layoutAdjustmentTimeoutRef.current) {
        clearTimeout(layoutAdjustmentTimeoutRef.current);
      }
    };
  }, [config.fields, backgroundUrl, runner, scheduleLayoutReady, isCapturing]);

  // วัดความกว้างและปรับให้ขึ้นบรรทัดใหม่ (Wrap Mode)
  useEffect(() => {
    // Frozen during capture for the same reason as the scale pass above.
    if (isCapturing) return;

    const wrapToFitFields = config.fields?.filter(f => f.toFitType === 'wrap') || [];
    if (wrapToFitFields.length === 0) return;

    const timeoutIds: NodeJS.Timeout[] = [];
    const imageTimeoutIds: NodeJS.Timeout[] = [];

    const measureAndAdjustField = (field: typeof wrapToFitFields[0]) => {
      const fieldDiv = fullNameFieldRefs.current[field.id];
      const container = containerRef.current;

      if (!fieldDiv || !container) {
        return;
      }

      const containerWidth = container.offsetWidth;
      if (containerWidth === 0) {
        setTimeout(() => measureAndAdjustField(field), 50);
        return;
      }

      const toFitWidth = field.toFitWidth || containerWidth * 0.9;
      const targetWidth = toFitWidth * 0.9;
      const originalContent = getOriginalContent(field);

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

      if (fieldWidth > maxWidth) {
        applyEllipsisWithWrapping(field, content, maxWidth);
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

    if (backgroundUrl) {
      const img = new Image();
      img.onload = () => {
        imageTimeoutIds.push(setTimeout(measureAllFields, 100));
      };
      img.src = backgroundUrl;
    }

    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
      imageTimeoutIds.forEach(id => clearTimeout(id));
      if (layoutAdjustmentTimeoutRef.current) {
        clearTimeout(layoutAdjustmentTimeoutRef.current);
      }
    };
  }, [config.fields, backgroundUrl, runner, scheduleLayoutReady, isCapturing]);

  return (
    <>
      <div
        ref={containerRef}
        className="w-[450px] relative font-sans text-gray-800 shadow-2xl mx-auto"
        style={{
          // The artwork rounds its own corners, but the runner's photo sits
          // behind it as a plain rectangle — so it showed through the corners
          // the artwork had rounded away. Clip the whole card to the same
          // radius. Only applied when there is a photo, so cards without one
          // keep rendering exactly as they always have.
          ...(profilePictureUrl
            ? { borderRadius: `${CARD_CORNER_RADIUS}px`, overflow: 'hidden' }
            : {}),
        }}
      >
        {/* Background Image - Controls Aspect Ratio */}
        <div style={{ overflow: 'hidden', width: '100%' }}>
          {backgroundUrl ? (
            <img
              src={backgroundUrl}
              alt="Pass Background"
              className="w-full h-auto block pointer-events-none"
              style={{
                borderRadius: `${CARD_CORNER_RADIUS}px`,
                border: 'transparent',
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
                return getRunnerValue(runner, source);
              }).filter(v => v !== '').join(separator);
            } else {
              content = getRunnerValue(runner, field.key);

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

            if (field.key === 'custom_image') {
              if (!field.imageUrl) return null;

              const pixelPos = isCapturing && pixelPositions[field.id]
                ? pixelPositions[field.id]
                : null;

              return (
                <img
                  key={field.id}
                  src={field.imageUrl}
                  alt={field.label || ''}
                  // No crossOrigin attribute on purpose: the background image
                  // doesn't set one either, and html2canvas (useCORS: true)
                  // applies it to its own clone at capture time. Setting it here
                  // would break plain display of any host without CORS headers.
                  style={{
                    borderRadius: '20px',
                    position: 'absolute',
                    left: pixelPos ? `${pixelPos.left}px` : `${field.x}%`,
                    top: pixelPos ? `${pixelPos.top}px` : `${field.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: field.imageWidth ? `${field.imageWidth}px` : 'auto',
                    height: field.imageHeight ? `${field.imageHeight}px` : 'auto',
                    // opacity: field.imageOpacity ?? 1,
                    objectFit: 'contain',
                    pointerEvents: 'none',
                  }}
                />
              );
            }

            if (field.key === 'profile_picture') {
              const pixelPos = isCapturing && pixelPositions[field.id]
                ? pixelPositions[field.id]
                : null;

              const profileWidth = field.profileWidth || 100;
              const profileHeight = field.profileHeight || 100;
              const profileShape = field.profileShape || 'circle'; // Default to circle
              // Use profilePictureUrl prop if provided (from cropped image), otherwise use placeholder
              const profileUrl = profilePictureUrl || field.profilePicture
                || (showEmptyPhotoSlot ? PHOTO_SLOT_PLACEHOLDER : '');

              // An empty slot draws nothing on a runner's card. The stand-in used
              // to render here regardless, sized to cover the slot — which on a
              // slot wider than the card meant a square rectangle sitting behind
              // the artwork and poking out through its rounded corners.
              if (!profileUrl) return null;
              // Soft feathered edge: opaque in the center, fades to transparent
              // near the rim so the photo blends into the artwork cut-out.
              const softEdgeMask = profileShape === 'circle'
                ? 'radial-gradient(circle closest-side, #000 62%, transparent 100%)'
                : [
                    'linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%)',
                    'linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)',
                  ].join(', ');

              // Cover the slot the long way round, by sizing the photo
              // ourselves. object-fit does this in one line on screen, but
              // html2canvas doesn't implement it — it stretches the photo to the
              // slot instead, so the saved card came out distorted while the
              // page looked fine. Explicit dimensions are the same in both.
              const natural = photoNaturalSizes[field.id];
              const coverScale = natural && natural.width > 0 && natural.height > 0
                ? Math.max(profileWidth / natural.width, profileHeight / natural.height)
                : 0;
              const coverWidth = coverScale ? natural!.width * coverScale : profileWidth;
              const coverHeight = coverScale ? natural!.height * coverScale : profileHeight;

              return (
                  <img
                    key={field.id}
                    src={profileUrl}
                    alt="Profile"
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      const size = { width: el.naturalWidth, height: el.naturalHeight };
                      setPhotoNaturalSizes((prev) => {
                        const current = prev[field.id];
                        if (current && current.width === size.width && current.height === size.height) return prev;
                        return { ...prev, [field.id]: size };
                      });
                    }}
                    style={{
                      position: 'absolute',
                      left: pixelPos ? `${pixelPos.left}px` : `${field.x}%`,
                      top: pixelPos ? `${pixelPos.top}px` : `${field.y}%`,
                      transform: 'translate(-50%, -50%)',
                      // Cover dimensions rather than the slot's, so the photo
                      // keeps its own shape. What trims it back to the slot is
                      // the artwork's cut-out, not a clipping box: html2canvas
                      // mis-renders a photo nested inside an overflow:hidden
                      // wrapper (wrong size and position), while it handles this
                      // single positioned image correctly.
                      width: `${coverWidth}px`,
                      height: `${coverHeight}px`,
                      // Tailwind's base stylesheet caps images at max-width:100%,
                      // which would pull the cover width back down.
                      maxWidth: 'none',
                      // Behind the artwork on purpose: the photo shows through
                      // the cut-out, so the artwork keeps its logo and text bar
                      // on top of it.
                      zIndex: -1,
                      borderRadius: profileShape === 'circle' ? '50%' : '40px',
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
            if (isPlaceholderValue(displayContent)) {
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

export default BibPassTemplate;