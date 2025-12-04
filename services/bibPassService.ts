
import QRCode from 'qrcode';
import { Runner } from '../types';

export const generateQrCodeDataUrl = async (content: string, colour_sign: string): Promise<string> => {
  try {
    // let color = colour_sign === 'VIP' ? '#70a8a7' : '#1a75bb';
    const dataUrl = await QRCode.toDataURL(content, {
      errorCorrectionLevel: 'H',
      width: 150,
      margin: 2,
      color: {
        dark: '#ffffff',
        light: '#00000000',
      },
    });
    return dataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return '';
  }
};

export const generateBibPassImage = async (
  runner: Runner,
  qrCodeDataUrl: string,
  customImageUrl?: string,
): Promise<Blob | null> => {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    
    // Helper function to wrap text within the canvas
    const wrapText = (
        context: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number
    ): number => { // Return the Y of the last line drawn
        const words = text.split(' ');
        let line = '';
        let currentY = y;

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = context.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                context.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        context.fillText(line, x, currentY);
        return currentY;
    };


    // Set canvas dimensions
    canvas.width = 600;
    canvas.height = 400;

    // Background
    ctx.fillStyle = '#1f2937'; // Dark background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = '#3b82f6'; // Blue border
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // Title
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = '#f9fafb'; // Light text
    ctx.textAlign = 'center';
    ctx.fillText('RACE BIB PASS', canvas.width / 2, 50);

    // Custom Image (if provided) - draw it first to determine space for name
    let hasCustomImage = false;
    if (customImageUrl) {
        const customImg = new Image();
        customImg.crossOrigin = "anonymous";
        customImg.src = customImageUrl;
        
        const imageLoaded = await new Promise<boolean>(resolve => {
            customImg.onload = () => resolve(true);
            customImg.onerror = () => {
                console.warn(`[bibPassService] Failed to load custom image. It will not be included.`);
                resolve(false);
            };
        });

        if (imageLoaded) {
            ctx.drawImage(customImg, canvas.width - 150 - 30, 60, 150, 100);
            hasCustomImage = true;
        }
    }
    
    // Runner Name - position adjusted based on custom image
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = '#f9fafb';
    ctx.textAlign = 'center';
    const nameMaxWidth = hasCustomImage ? canvas.width - 150 - 60 : canvas.width - 60; // 30px padding on each side
    const nameX = hasCustomImage ? 30 + nameMaxWidth / 2 : canvas.width / 2;
    ctx.fillText(`${runner.first_name} ${runner.last_name}`, nameX, 100, nameMaxWidth);

    // Bib Number
    ctx.font = 'bold 80px Arial';
    ctx.fillStyle = '#fca5a5'; // Light red for bib
    ctx.fillText(runner.bib, canvas.width / 2, 200);

    // Name on Bib
    ctx.font = '24px Arial';
    ctx.fillStyle = '#f9fafb';
    ctx.fillText(runner.name_on_bib, canvas.width / 2, 250);

    // Other details (left aligned with text wrapping)
    ctx.textAlign = 'left';
    ctx.font = '18px Arial';
    ctx.fillStyle = '#f9fafb';

    const qrCodeSize = 100;
    const textStartX = 30;
    const textMaxWidthForWrap = canvas.width - textStartX - qrCodeSize - 30 - 20; // x-padding, qr, qr-padding, gap
    const lineHeight = 22;
    let currentY = 300;
    
    currentY = wrapText(ctx, `Race Kit: ${runner.race_kit}`, textStartX, currentY, textMaxWidthForWrap, lineHeight) + lineHeight;
    currentY = wrapText(ctx, `Wave Start: ${runner.wave_start}`, textStartX, currentY, textMaxWidthForWrap, lineHeight) + lineHeight;
    wrapText(ctx, `Block: ${runner.block}`, textStartX, currentY, textMaxWidthForWrap, lineHeight);

    // QR Code
    if (qrCodeDataUrl) {
      const qrImage = new Image();
      qrImage.src = qrCodeDataUrl;
      await new Promise(resolve => { qrImage.onload = resolve; });
      ctx.drawImage(qrImage, canvas.width - qrCodeSize - 30, canvas.height - qrCodeSize - 30, qrCodeSize, qrCodeSize);
    }
    
    // Convert canvas to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  } catch (error) {
    console.error('Error generating bib pass image:', error);
    return null;
  }
};
