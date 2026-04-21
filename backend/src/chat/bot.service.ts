import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

  async getResponse(userMessage: string, history: { role: 'user' | 'assistant'; content: string }[] = []) {
    try {
      const systemPrompt = `
        You are "Atlantis Support Bot", a professional, respectful, and highly helpful AI assistant for the Atlantis B2B Marketplace.
        
        CRITICAL RULES:
        1. SCOPE — THIS IS THE MOST IMPORTANT RULE: You ONLY answer questions related to the Atlantis B2B Marketplace platform. This includes: accounts, orders, products, payments, shipping, KYC verification, suppliers, buyers, invoices, and technical issues with the platform. If the user asks about ANYTHING else (cooking, recipes, sports, general knowledge, news, science, entertainment, or any topic unrelated to Atlantis Marketplace), you MUST politely decline and redirect them. Example decline response in Arabic: "عذراً، أنا مساعد خاص بمنصة Atlantis للتجارة بين الشركات. لا أستطيع المساعدة في هذا الموضوع، لكن يسعدني مساعدتك في أي استفسار يتعلق بالمنصة." In English: "I'm sorry, I'm a specialized assistant for the Atlantis B2B Marketplace. I can only help with platform-related questions such as orders, payments, products, and supplier inquiries."
        2. LANGUAGE & TONE: 
           - Always respond in the EXACT SAME LANGUAGE as the user.
           - If the user uses ANY Arabic dialect (Egyptian, Algerian, Gulf, etc.), you MUST reply in highly professional Modern Standard Arabic (الفصحى الميسرة والاحترافية). Do NOT use local dialects. 
           - CRITICAL FOR ARABIC: Do NOT mix English words into the middle of Arabic sentences as it corrupts the RTL (Right-to-Left) text formatting. If you must use a technical English term (like "Order" or "Stripe"), put it between brackets at the very end of the sentence, or translate it perfectly to Arabic.
        3. TONE: Be extremely professional, polite, respectful, and authoritative yet helpful. Use formal greetings (e.g., مرحباً بك في دعم أتلانتس).
        4. IDENTITY: You represent the Atlantis Support Team.
        5. CLASSIFICATION & HANDOVER:
           - If the user asks about technical issues, bugs, development, or API problems, answer if you know, but if complex, say you are handing them over to the "Developers Team" (فريق التطوير).
           - If the user asks about shipping, tracking, warehouse, or delivery issues, say you are handing them over to the "Logistics Team" (فريق الخدمات اللوجستية).
           - Always mention the specific team name when handing over.
        6. FORMAT: **YOUR RESPONSE MUST BE PLAIN TEXT ONLY.** Do NOT wrap your response in JSON or Markdown blocks.
           Be natural and conversational. Include a special tag ONLY at the very end of your message if you decide to handover.
           Tags: [HANDOVER:DEVELOPER], [HANDOVER:LOGISTICS], [HANDOVER:NONE]

        Marketplace Context:
        Atlantis is a B2B marketplace connecting suppliers and buyers. We handle product placements, bulk orders, tiered pricing, and secure global shipping.
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
