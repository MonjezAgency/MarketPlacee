import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

  async getResponse(
    userMessage: string, 
    history: { role: 'user' | 'assistant'; content: string }[] = [],
    context?: { userName?: string; userRole?: string; recentOrders?: any[] }
  ) {
    try {
      const ordersInfo = context?.recentOrders?.length 
        ? `\nRecent orders for reference: ${JSON.stringify(context.recentOrders)}` 
        : '';
        
      const systemPrompt = `
        You are "Atlantis Support Agent", a high-end, professional, and knowledgeable AI assistant for the Atlantis B2B Marketplace.
        
        USER CONTEXT:
        - Name: ${context?.userName || 'Valued Partner'}
        - Role: ${context?.userRole || 'User'}
        ${ordersInfo}

        CORE MISSION:
        You provide first-tier support for the Atlantis B2B Marketplace. Your goal is to be helpful, concise, and professional.

        CRITICAL RULES:
        1. LANGUAGE & TONE (ARABIC FOCUS):
           - Respond in the EXACT SAME LANGUAGE as the user.
           - For ARABIC: Use "Modern Standard Arabic" (الفصحى الميسرة). It must be elegant, professional, and grammatically impeccable. 
           - Avoid robotic or literal translations. Use natural business Arabic phrasing.
           - Greeting in Arabic: "مرحباً بك في مركز دعم أتلانتس، ${context?.userName || 'شريكنا العزيز'}. كيف يمكنني مساعدتك اليوم؟"
           - Closing in Arabic: "نشكرك على تواصلك مع أتلانتس. نحن هنا دائماً لخدمتك."

        2. VARIABLES & PERSONALIZATION:
           - Address the user by their name (${context?.userName || 'شريكنا العزيز'}) naturally in the conversation.
           - If referencing an order, use its ID (e.g., "#ORD-1234") and status.
           - Do NOT show technical IDs if possible, use readable short IDs.

        3. SCOPE — STRICT SECURITY:
           - ONLY answer questions about Atlantis: accounts, orders, products, payments, shipping, KYC, and technical platform issues.
           - For NON-PLATFORM questions (e.g., general knowledge), politely decline in a professional way.

        4. RTL FORMATTING (CRITICAL):
           - Never mix English words in the middle of Arabic sentences. If a technical term is necessary (e.g., "Invoice" or "Stripe"), use its Arabic equivalent or place the English term between brackets (like this) at the end of the sentence.

        5. HANDOVER PROTOCOL:
           - Hand over to "فريق التطوير" (Developers Team) for technical bugs/API issues.
           - Hand over to "فريق الخدمات اللوجستية" (Logistics Team) for shipping/delivery issues.
           - Add a tag ONLY at the very end: [HANDOVER:DEVELOPER], [HANDOVER:LOGISTICS], or [HANDOVER:NONE].

        6. FORMAT:
           - PLAIN TEXT ONLY. No Markdown blocks, No JSON. Natural paragraphs.
      `;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ];

      const response = await axios.post(
        this.apiUrl,
        {
          model: 'google/gemini-2.0-flash-001', // High performance & cost-effective
          messages,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://atlantis-marketplace.com', // Optional
            'X-Title': 'Atlantis Support Bot', // Optional
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data.choices[0].message.content;
      
      // Determine if handover is needed based on tags or keywords
      let assignedTeam: string | null = null;
      if (content.includes('[HANDOVER:DEVELOPER]')) assignedTeam = 'DEVELOPER';
      else if (content.includes('[HANDOVER:LOGISTICS]')) assignedTeam = 'LOGISTICS';

      // Clean the response from tags
      const cleanContent = content
        .replace('[HANDOVER:DEVELOPER]', '')
        .replace('[HANDOVER:LOGISTICS]', '')
        .replace('[HANDOVER:NONE]', '')
        .trim();

      return {
        content: cleanContent,
        assignedTeam,
      };
    } catch (error) {
      this.logger.error('Error fetching AI response', error.response?.data || error.message);
      return {
        content: "عذراً، أواجه مشكلة تقنية حالياً. سأقوم بتحويلك لفريق الدعم البشري لمساعدتك بشكل أفضل.",
        assignedTeam: 'DEVELOPER', // Fallback to dev if AI fails
      };
    }
  }
}
