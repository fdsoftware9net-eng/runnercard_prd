import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { getRunnerByAccessKey, updateRunner as updateRunnerService, getWalletConfig, logUserActivity, updateWalletPass, checkWalletPass } from '../services/supabaseService';
import { getSession } from '../services/authService';
import { Runner, WebPassConfig } from '../types';
import { generateQrCodeDataUrl } from '../services/bibPassService';
import Input from './Input';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import { getConfig } from '../constants';
import BibPassTemplate from './BibPassTemplate';
import { DEFAULT_CONFIG } from '../defaults';
// @ts-ignore - html2canvas types might not be automatically picked up in this environment
import html2canvas from 'html2canvas';

const GOOGLE_WALLET_EDGE_FUNCTION_URL = '/functions/v1/generate-google-wallet-pass';
const APPLE_WALLET_EDGE_FUNCTION_URL = '/functions/v1/generate-apple-wallet-pass';

interface BibPassDisplayProps {

}

export const BibPassDisplay: React.FC<BibPassDisplayProps> = () => {
  const { accessKey } = useParams<{ accessKey: string }>();
  const location = useLocation();
  const [runner, setRunner] = useState<Runner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSessionChecked, setIsSessionChecked] = useState(false);
  const [idCardHashInput, setIdCardHashInput] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [bibPassQrCodeUrl, setBibPassQrCodeUrl] = useState<string>('');
  const [webConfig, setWebConfig] = useState<WebPassConfig>(DEFAULT_CONFIG.web_pass_config!);

  const [isAddingToGoogleWallet, setIsAddingToGoogleWallet] = useState(false);
  const [isAddingToAppleWallet, setIsAddingToAppleWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isSavingImage, setIsSavingImage] = useState(false);

  // Ref for the container we want to capture
  const passContainerRef = useRef<HTMLDivElement>(null);
  const templateContainerRef = useRef<HTMLDivElement | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const fetchRunnerData = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);

    try {
      const [configResult, runnerResult] = await Promise.all([
        getWalletConfig(),
        getRunnerByAccessKey(key)
      ]);

      let selectedConfig: WebPassConfig = DEFAULT_CONFIG.web_pass_config!;

      if (configResult.data) {
        const templates = configResult.data.web_pass_templates || [];
        const rules = configResult.data.template_assignment_rules || [];
        const legacyConfig = configResult.data.web_pass_config;

        // 1. Default to the first template, or legacy, or global default
        if (templates.length > 0) {
          selectedConfig = templates[0];
        } else if (legacyConfig) {
          selectedConfig = legacyConfig;
        }

        // 2. Check for Rule Matches (if runner exists)
        if (runnerResult.data) {
          const runnerData = runnerResult.data;
          // Iterate through rules to find a match
          for (const rule of rules) {
            if (rule.operator === 'equals') {
              const runnerValue = String(runnerData[rule.column] || '').trim();
              const ruleValue = String(rule.value || '').trim();

              if (runnerValue === ruleValue) {
                const foundTemplate = templates.find(t => t.id === rule.template_id);
                if (foundTemplate) {
                  selectedConfig = foundTemplate;
                  break; // First match wins
                }
              }
            }
          }
        }

        // 3. Direct Assignment Overrides Rules (Highest Priority)
        if (runnerResult.data && runnerResult.data.web_pass_template_id) {
          const foundTemplate = templates.find(t => t.id === runnerResult.data.web_pass_template_id);
          if (foundTemplate) {
            selectedConfig = foundTemplate;
          }
        }
      }

      setWebConfig({
        ...DEFAULT_CONFIG.web_pass_config!,
        ...selectedConfig,
        fields: (selectedConfig.fields && selectedConfig.fields.length > 0) ? selectedConfig.fields : (DEFAULT_CONFIG.web_pass_config?.fields || [])
      });

      if (runnerResult.data) {
        setRunner(runnerResult.data);
        console.log('runnerResult.data', runnerResult.data);

        const qrContent = runnerResult.data.qr || `Runner ID: ${runnerResult.data.id} - Bib: ${runnerResult.data.bib}`;
        const qrUrl = await generateQrCodeDataUrl(qrContent, runnerResult.data.colour_sign || '');
        setBibPassQrCodeUrl(qrUrl);

        if (!runnerResult.data.pass_generated) {
          await updateRunnerService({ id: runnerResult.data.id, pass_generated: true });
        }
      } else if (runnerResult.error) {
        setError(runnerResult.error || 'Failed to retrieve runner data.');
      } else {
        setError('Runner not found. Please check your access link.');
      }
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }

  }, []);

  useEffect(() => {
    const checkAdminSession = async () => {
      try {
        const { session } = await getSession();
        if (session) {
          setIsAdmin(true);
        }
      } catch (e) {
        console.log('No active admin session found.');
      } finally {
        setIsSessionChecked(true);
      }
    };
    checkAdminSession();
  }, []);

  useEffect(() => {
    if (accessKey) {
      fetchRunnerData(accessKey);
    } else {
      setError('No access key provided.');
      setLoading(false);
    }
  }, [accessKey, fetchRunnerData]);

  useEffect(() => {
    if (runner) {
      setIsVerified(true);
    }
  }, [runner]);

  const handleVerification = useCallback(() => {
    if (!runner) return;

    // If runner has no ID Card Hash, use BIB for verification
    if (!runner.id_card_hash) {
      if (idCardHashInput.trim().toUpperCase() === runner.bib.toUpperCase()) {
        setIsVerified(true);
        setVerificationError(null);
      } else {
        setVerificationError('Invalid BIB. Please enter your BIB number to verify.');
      }
      return;
    }

    // Normal verification with ID Card Hash
    if (idCardHashInput === runner.id_card_hash) {
      setIsVerified(true);
      setVerificationError(null);
    } else {
      setVerificationError('Invalid ID Card Hash. Please try again.');
    }
  }, [runner, idCardHashInput]);

  const handleSaveAsImage = useCallback(async () => {
    // 0. ตรวจสอบความพร้อม
    if (!templateContainerRef.current || !runner) return;

    // =================================================================================
    // ส่วนที่ 1: ตรวจสอบ Browser (Android In-App) แล้วแจ้งเตือนทันที
    // =================================================================================
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isAndroid = /Android/i.test(userAgent);
    const isLineApp = /Line/i.test(userAgent);
    const isFacebookApp = /FBAN|FBAV|Messenger|Instagram/i.test(userAgent);
    const currentUrl = new URL(window.location.href);

    // เช็คเฉพาะ Android ที่เปิดผ่าน LINE หรือ Facebook
    if (isAndroid) {
      if (isLineApp) {
        // สำหรับ LINE: ใช้ openExternalBrowser parameter
        currentUrl.searchParams.set('openExternalBrowser', '1');

        // แจ้งเตือนผู้ใช้ก่อนเด้ง
        const userConfirmed = confirm(
          "he in-app browser do not allow saving image.\n" +
          "บราวเซอร์ของคุณไม่อนุญาติให้บันทึกรูป"
        );

        if (userConfirmed) {
          window.location.href = currentUrl.toString();
        }
        return;
      }

      if (isFacebookApp) {
        const currentUrl = window.location.href;

        // [CASE 1]: Android ใช้เทคนิค Intent เพื่อดีดไป Chrome
        if (isAndroid) {
          // ลบ https:// ออกจาก url เดิม
          const urlWithoutProtocol = currentUrl.replace(/^https?:\/\//, '');

          // สร้าง Intent URL สำหรับ Android เพื่อบังคับเปิด Chrome
          // รูปแบบ: intent://<url>#Intent;scheme=https;package=com.android.chrome;end
          const intentUrl = `intent://${urlWithoutProtocol}#Intent;scheme=https;package=com.android.chrome;end`;

          // สั่ง Redirect ไปยัง Intent
          window.location.href = intentUrl;
          return;
        }

        // [CASE 2]: iOS หรืออื่นๆ ที่ใช้ Intent ไม่ได้ -> ต้องแจ้งเตือน
        else {
          alert("the in-app browser do not allow saving image.\n\nบราวเซอร์ของคุณไม่อนุญาติให้บันทึกรูป");
          window.location.href = currentUrl.toString();
          return;
        }
      }
    }
    // =================================================================================

    setIsSavingImage(true);
    setIsCapturing(true);

    try {
      const templateContainer = templateContainerRef.current;

      // --- ส่วนที่ 2: จัดการ Layout และ html2canvas (เหมือนเดิม) ---
      const actualWidth = templateContainer.offsetWidth;
      const actualHeight = templateContainer.offsetHeight;
      const originalWidth = templateContainer.style.width;
      const originalMaxWidth = templateContainer.style.maxWidth;
      templateContainer.style.width = `${actualWidth}px`;
      templateContainer.style.maxWidth = `${actualWidth}px`;

      await new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 300);
          });
        });
      });

      const canvas = await html2canvas(templateContainer, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
        logging: false,
        width: actualWidth,
        height: actualHeight,
        allowTaint: false
      });

      // คืนค่า Layout เดิม
      templateContainer.style.width = originalWidth;
      templateContainer.style.maxWidth = originalMaxWidth;
      setIsCapturing(false);

      // --- ส่วนที่ 3: เตรียมไฟล์รูปภาพ ---
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Create Blob Failed");

      const fileName = `RunnerPass_${runner.bib}.png`;
      const file = new File([blob as unknown as BlobPart], fileName, { type: 'image/png' });
      const objectUrl = URL.createObjectURL(blob as Blob);

      // --- ส่วนที่ 4: เช็ค OS และแยก Flow การทำงาน (iOS และ Browser ปกติ) ---
      const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;

      const performDownload = () => {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      };

      if (isIOS) {
        // [CASE iOS]: ใช้ Share Sheet
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Runner Pass',
              text: 'Here is my runner pass!',
            });
            URL.revokeObjectURL(objectUrl);
          } catch (shareError) {
            performDownload();
          }
        } else {
          performDownload();
        }
      } else {
        // [CASE Android Chrome / Desktop]: ดาวน์โหลดปกติ
        // (เพราะ LINE/FB ถูกดักจับไปตั้งแต่ต้นฟังก์ชันแล้ว)
        performDownload();
      }

      // Log activity
      logUserActivity({
        activity_type: 'save_image',
        runner_id: runner.id || null,
        success: true,
        metadata: {
          image_format: 'png',
          file_name: fileName,
        },
      }).catch((err) => console.warn('Failed log:', err));

    } catch (err) {
      console.error("Failed to generate image:", err);
      setWalletError("Failed to save image. Please try again.");
      setIsCapturing(false);


      // Log failed...
      if (runner?.id) {
        logUserActivity({
          activity_type: 'save_image',
          runner_id: runner.id,
          success: false,
          error_message: err instanceof Error ? err.message : 'Failed to save image',
        }).catch((logErr) => {
          console.warn('Failed to log save image activity:', logErr);
        });
      }
    } finally {
      setIsSavingImage(false);
    }
  }, [runner]);

  const handleAddPassportToWallet = useCallback(async (walletType: 'google' | 'apple') => {
    setWalletError(null);
    if (!runner) return;

    const config = getConfig();
    const functionUrl = walletType === 'google' ? GOOGLE_WALLET_EDGE_FUNCTION_URL : APPLE_WALLET_EDGE_FUNCTION_URL;
    const fullUrl = `${config.SUPABASE_URL}${functionUrl}`;

    if (walletType === 'google') {
      setIsAddingToGoogleWallet(true);
      try {
        const checkResult = await checkWalletPass(runner.id);

        // 1. สร้างตัวแปรเช็คว่าเป็น Update หรือ Create
        const isUpdate = !!checkResult.data; // ถ้ามี data แปลว่าเป็น Update

        let body;
        if (isUpdate) {
          // Case Update: ส่ง objectIdReq ไปด้วย
          body = { runnerId: runner.id, updatePass: true };
        } else {
          // Case Create: ส่งแค่ runnerId
          body = { runnerId: runner.id, updatePass: false };
        }

        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify(body),
        });

        const responseText = await response.text();
        if (response.status === 401) throw new Error(`Unauthorized (401). Disable Verify JWT.`);

        let data;
        try { data = JSON.parse(responseText); } catch (e) { throw new Error(responseText || `Server Error`); }

        if (!response.ok) throw new Error(data.error || data.message);

        if (data.saveToGoogleWalletLink) {
          // Update wallet pass ID in database if objectId is returned (Logic เดิม)
          if (data.objectId && runner?.id) {
            try {
              await updateWalletPass(runner.id, data.objectId);
              console.log('Google Wallet pass ID updated successfully:', data.objectId);
            } catch (updateError: any) {
              console.warn('Failed to update wallet pass ID:', updateError);
            }
          }

          // window.open(data.saveToGoogleWalletLink, '_blank');
          window.location.href = data.saveToGoogleWalletLink;

        } else {
          setWalletError('Failed to get Google Wallet link.');
        }
      } catch (err: any) {
        console.error('Google Wallet Error:', err);
        setWalletError(err.message);
      } finally {
        setIsAddingToGoogleWallet(false);
      }
    } else if (walletType === 'apple') {
      setIsAddingToAppleWallet(true);

      try {
        // 1. กำหนด URL พร้อม Query Param (เพื่อให้ Function รู้ว่าใครขอ Pass)
        const downloadUrl = `${fullUrl}?runnerId=${runner.id}`;

        // 2. ✅ แก้ไข: สำหรับ Safari (ทั้ง iOS และ Desktop) ใช้ direct link แทน blob
        // Safari มีปัญหาในการดาวน์โหลด blob URL แต่จะรู้จัก application/vnd.apple.pkpass จาก direct link
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

        if (isSafari || isIOS) {
          // ✅ สำหรับ Safari: ใช้ direct link ไปที่ API endpoint
          // Safari จะรู้จัก application/vnd.apple.pkpass และเปิดใน Wallet app อัตโนมัติ
          console.log('Using direct link for Safari/iOS');
          window.location.href = downloadUrl;

          // ให้เวลา Safari เปิด Wallet app
          setTimeout(() => {
            setIsAddingToAppleWallet(false);
          }, 2000);
          return;
        }

        // 3. สำหรับ Browser อื่นๆ: ใช้ fetch + blob (Chrome, Firefox, etc.)
        const response = await fetch(downloadUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.SUPABASE_ANON_KEY}`,
            'Accept': 'application/vnd.apple.pkpass'
          }
        });

        // 4. เช็ค Error (ถ้าไม่ใช่ 200 OK)
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Failed to generate Apple Wallet pass.';
          let errorData: any = {};

          try {
            errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorData.message || errorMessage;

            // ✅ เพิ่ม: แสดง troubleshooting steps ถ้ามี
            if (errorData.troubleshooting && Array.isArray(errorData.troubleshooting)) {
              const troubleshooting = errorData.troubleshooting.join('\n• ');
              errorMessage = `${errorMessage}\n\n${troubleshooting}`;

              // ถ้ามี configUrl ให้แนะนำ
              if (errorData.configUrl) {
                errorMessage += `\n\nPlease go to Apple Wallet Configuration to fix this.`;
              }
            }
          } catch (e) {
            errorMessage = errorText || `Server returned ${response.status}`;
          }

          // สร้าง error object ที่มี troubleshooting info
          const error = new Error(errorMessage) as any;
          error.troubleshooting = errorData.troubleshooting;
          error.configUrl = errorData.configUrl;
          throw error;
        }

        // 5. เช็ค Content-Type ว่าเป็น pkpass จริงไหม
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/vnd.apple.pkpass')) {
          throw new Error('Invalid file type returned from server.');
        }

        // 6. แปลงเป็น Blob และดาวน์โหลด
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        // ✅ สำหรับ Desktop/Android (non-Safari): ใช้ <a download>
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `RacePass_${runner.bib || 'ticket'}.pkpass`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Cleanup
        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 1000);

      } catch (err: any) {
        console.error('Apple Wallet Error:', err);

        // ✅ เพิ่ม: แสดง error message ที่ชัดเจนขึ้น
        let errorMessage = err.message || 'Failed to generate Apple Wallet pass.';

        // ถ้า error มี troubleshooting info ให้แสดง
        if (err.troubleshooting && Array.isArray(err.troubleshooting)) {
          errorMessage = `${err.message || err.error || 'Failed to generate Apple Wallet pass.'}\n\n${err.troubleshooting.join('\n')}`;

          // ถ้ามี configUrl ให้แนะนำให้ไปตั้งค่า
          if (err.configUrl) {
            errorMessage += `\n\nPlease configure Icon Image URL in Apple Wallet settings.`;
          }
        }

        setWalletError(errorMessage);
      } finally {
        // ย้ายมาไว้ใน finally เพื่อให้ loading หายไปเสมอ ไม่ว่าจะ error หรือสำเร็จ
        setIsAddingToAppleWallet(false);
      }
    }
  }, [runner]);

  if (loading || !isSessionChecked) {
    return <div className="flex justify-center items-center min-h-screen"><LoadingSpinner message="Loading..." /></div>;
  }

  if (error || !runner) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <div className="bg-red-900 text-red-100 p-6 rounded-lg shadow-md max-w-md text-center">
          <h2 className="text-2xl font-bold mb-4">Error</h2>
          <p>{error || 'Runner not found.'}</p>
          <Button onClick={() => window.location.href = '/'} className="mt-4">Go to Home</Button>
        </div>
      </div>
    );
  }

  const shouldShowPass = isVerified || isAdmin;

  if (!shouldShowPass) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <div className="bg-gray-800 p-6 rounded-lg shadow-md max-w-md w-full">
          <h2 className="text-2xl font-bold text-white mb-4 text-center">Verify Your Runner Pass</h2>
          {runner && !runner.id_card_hash ? (
            <>
              <p className="text-gray-300 text-sm mb-4 text-center">
                This runner does not have an ID Card Number. Please enter your BIB number to verify.
              </p>
              <Input
                id="id-card-hash-input"
                label="BIB Number"
                type="text"
                value={idCardHashInput}
                onChange={(e) => setIdCardHashInput(e.target.value)}
                error={verificationError}
                className="mb-4"
                placeholder="Enter your BIB number"
              />
            </>
          ) : (
            <Input
              id="id-card-hash-input"
              label="ID Card Hash"
              type="text"
              value={idCardHashInput}
              onChange={(e) => setIdCardHashInput(e.target.value)}
              error={verificationError}
              className="mb-4"
              placeholder="Enter your ID Card Hash"
            />
          )}
          <Button onClick={handleVerification} className="w-full">Verify</Button>
          <Button onClick={() => window.location.href = '/'} variant='secondary' className="w-full mt-2">Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-8 text-blue-400">Runner Card</h1>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Visual Pass (Using New Template) */}
        <div className="order-2 lg:order-1 flex flex-col">
          {/* Wrap the template in a div with a ref for html2canvas */}
          <div style={{ width: 'fit-content', position: 'relative' }}>
            <div ref={passContainerRef}>
              <BibPassTemplate
                runner={runner}
                config={webConfig}
                qrCodeUrl={bibPassQrCodeUrl}
                containerRefCallback={(ref) => { templateContainerRef.current = ref; }}
                isCapturing={isCapturing}
              />
            </div>
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

        {/* Right: Actions & Info */}
        <div className="order-1 lg:order-2 bg-gray-800 p-6 rounded-lg shadow-lg h-fit">
          {(() => {
            const isThai = runner.nationality?.toLowerCase() === 'thai';
            return (
              <>
                <h2 className="text-2xl font-bold mb-4">
                  {isThai ? `ยินดีต้อนรับ, ${runner.first_name}` : `Welcome, ${runner.first_name}`}
                </h2>
                <p className="text-gray-300 mb-6">
                  {isThai
                    ? 'Runner Card ของคุณพร้อมแล้ว กรุณาบันทึกบัตรนี้เพื่อใช้แสดงในการรับเสื้อและเบอร์วิ่ง (Race Kit) พร้อมกับบัตรประชาชนตัวจริง'
                    : 'Your runner card is ready. Please save this card to present for race kit pick-up along with your original passport.'}
                </p>

                <div className="space-y-4">
                  <Button onClick={handleSaveAsImage} className="w-full" loading={isSavingImage}>
                    {isSavingImage
                      ? (isThai ? 'กำลังบันทึกรูปภาพ...' : 'Saving Image...')
                      : (isThai ? 'บันทึกเป็นรูปภาพ' : 'Save as Image')}
                  </Button>

                  {<div className="border-t border-gray-700 pt-4">
                    <h3 className="text-lg font-semibold mb-3 text-white">
                      {isThai ? 'เพิ่มลงในกระเป๋าเงิน' : 'Add to Wallet'}
                    </h3>
                    {walletError && <p className="text-red-500 mb-2 text-sm">{walletError}</p>}
                    <div className="flex flex-col gap-3">
                      <Button onClick={() => handleAddPassportToWallet('google')} variant="secondary" loading={isAddingToGoogleWallet}>
                        {isAddingToGoogleWallet
                          ? (isThai ? 'กำลังสร้าง...' : 'Generating...')
                          : (isThai ? 'เพิ่มลงใน Google Wallet' : 'Add to Google Wallet')}
                      </Button>
                      <Button onClick={() => handleAddPassportToWallet('apple')} variant="secondary" loading={isAddingToAppleWallet}>
                        {isAddingToAppleWallet
                          ? (isThai ? 'กำลังสร้าง...' : 'Generating...')
                          : (isThai ? 'เพิ่มลงใน Apple Wallet' : 'Add to Apple Wallet')}
                      </Button>
                    </div>
                  </div>}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};