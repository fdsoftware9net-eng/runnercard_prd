


import { Runner, ApiResponse, ResendEmailPayload, ResendEmailResponse } from '../types';
import { getSupabaseClient } from './supabaseService';
import { getConfig } from '../constants';

// This function now assumes that env vars required by edge functions are set in the Supabase dashboard.
const RESEND_EDGE_FUNCTION_URL = '/functions/v1/send-email';


export const sendEmail = async (emailPayload: ResendEmailPayload): Promise<ApiResponse<ResendEmailResponse>> => {
  if (!RESEND_EDGE_FUNCTION_URL) {
    return { error: 'Resend Edge Function URL is not defined.' };
  }

  // --- KEY CHANGE ---
  // Use centralized, lazy-loaded config function.
  const config = getConfig();
  const fullUrl = `${config.SUPABASE_URL}${RESEND_EDGE_FUNCTION_URL}`;

  try {
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: The anon key is needed for invoking functions.
        'Authorization': `Bearer ${config.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(emailPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Edge Function error: ${response.status} ${response.statusText}`);
    }

    const data: ResendEmailResponse = await response.json();
    return { data };
  } catch (error: any) {
    console.error('Error sending email via Edge Function:', error);
    return { error: error.message || 'Failed to send email via Edge Function.' };
  }
};

export const sendBulkBibPassEmails = async (
  runners: Runner[],
  bibPassBaseUrl: string,
  fromEmail: string,
  subject: string,
): Promise<ApiResponse<{ successCount: number; failCount: number; }>> => {
  let successCount = 0;
  let failCount = 0;
  const emailsToSend = runners.filter(r => r.id_card_hash && r.access_key);

  for (const runner of emailsToSend) {
    const personalizedLink = `${bibPassBaseUrl}/#/bibpass/${runner.access_key}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Hello ${runner.first_name} ${runner.last_name},</h2>
        <p>Your runner pass is ready! Please click the link below to view and verify your details for the upcoming race.</p>
        <p><a href="${personalizedLink}" style="display: inline-block; padding: 10px 20px; margin: 15px 0; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 5px;">View Your Runner Pass</a></p>
        <p>Upon clicking the link, you will be asked to enter your ID Card Hash (เลขบัตรประชาชน) for verification:</p>
        <p><strong>Your ID Card Hash: ${runner.id_card_hash}</strong></p>
        <p>Good luck with your race!</p>
        <p>Best regards,<br>The Race Organizer Team</p>
      </div>
    `;
    const emailText = `
      Hello ${runner.first_name} ${runner.last_name},

      Your runner pass is ready! Please click the link below to view and verify your details for the upcoming race.

      ${personalizedLink}

      Upon clicking the link, you will be asked to enter your ID Card Hash (เลขบัตรประชาชน) for verification:
      Your ID Card Hash: ${runner.id_card_hash}

      Good luck with your race!

      Best regards,
      The Race Organizer Team
    `;

    const emailPayload: ResendEmailPayload = {
      to: `example@example.com`, // Placeholder, replace with actual runner email if available in data
      from: fromEmail,
      subject: subject,
      html: emailHtml,
      text: emailText,
    };

    // Simulate finding an email address, assuming 'note' or a dedicated 'email' field might contain it
    // For this example, we'll use a dummy email. In a real scenario, you'd need the actual email from the data.
    // If you have an 'email' column in your Excel, map it to Runner interface and use runner.email here.
    const runnerEmail = `runner-${runner.id_card_hash.substring(0, 5)}@example.com`; // Dummy email
    if (runnerEmail) {
        emailPayload.to = runnerEmail;
        const result = await sendEmail(emailPayload); // Use the updated sendEmail function
        if (result.data) {
        successCount++;
        // Mark runner as pass_generated in Supabase
        await getSupabaseClient().from('runners').update({ pass_generated: true }).eq('id', runner.id);
        } else {
        failCount++;
        console.error(`Failed to send email to ${runner.first_name} ${runner.last_name} (${runner.id_card_hash}):`, result.error);
        }
    } else {
        failCount++;
        console.warn(`Skipping email for runner ${runner.first_name} ${runner.last_name} due to missing email address.`);
    }
  }

  return { data: { successCount, failCount } };
};