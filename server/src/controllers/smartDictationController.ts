import { Request, Response } from 'express';
import OpenAI from 'openai';

// H&P Section definitions matching HPAccordion
const HP_SECTIONS = [
  { id: 'chief_complaint', title: "Today's Visit / Chief Complaint" },
  { id: 'hpi', title: 'HPI / Subjective / Objective' },
  { id: 'past_medical_history', title: 'Past Medical History' },
  { id: 'past_surgical_history', title: 'Past Surgical History' },
  { id: 'health_maintenance', title: 'Health Maintenance' },
  { id: 'immunization_history', title: 'Immunization History' },
  { id: 'home_medications', title: 'Home Medications' },
  { id: 'allergies', title: 'Allergies' },
  { id: 'social_history', title: 'Social History' },
  { id: 'family_history', title: 'Family History' },
  { id: 'primary_care_provider', title: 'Primary Care Provider' },
  // ROS subsections
  { id: 'ros_constitutional', title: 'ROS - Constitutional' },
  { id: 'ros_allergic', title: 'ROS - Allergic / Immunologic' },
  { id: 'ros_head', title: 'ROS - Head' },
  { id: 'ros_eyes', title: 'ROS - Eyes' },
  { id: 'ros_ent', title: 'ROS - Ears, Nose, Mouth and Throat' },
  { id: 'ros_neck', title: 'ROS - Neck' },
  { id: 'ros_breasts', title: 'ROS - Breasts' },
  { id: 'ros_respiratory', title: 'ROS - Respiratory' },
  { id: 'ros_cardiac', title: 'ROS - Cardiac/Peripheral Vascular' },
  { id: 'ros_gi', title: 'ROS - Gastrointestinal' },
  { id: 'ros_gu', title: 'ROS - Genitourinary' },
  { id: 'ros_musculoskeletal', title: 'ROS - Musculoskeletal' },
  { id: 'ros_skin', title: 'ROS - Skin' },
  { id: 'ros_neuro', title: 'ROS - Neurological' },
  { id: 'ros_psych', title: 'ROS - Psychiatric' },
  { id: 'ros_endo', title: 'ROS - Endocrine' },
  { id: 'ros_heme', title: 'ROS - Hematologic/Lymphatic' },
  { id: 'vital_signs', title: 'Vital Signs' },
  { id: 'physical_exam', title: 'Physical Exam' },
  { id: 'lab_results', title: 'Lab Results' },
  { id: 'imaging_results', title: 'Imaging Results' },
  { id: 'assessment', title: 'Assessment/Problem List' },
  { id: 'plan', title: 'Plan' },
];

const SYSTEM_PROMPT = `You are a medical documentation assistant. Your task is to parse a physician's or nurse's dictated clinical notes and categorize the content into structured H&P (History & Physical) sections.

AVAILABLE SECTIONS:
${HP_SECTIONS.map(s => `- ${s.id}: ${s.title}`).join('\n')}

INSTRUCTIONS:
1. Analyze the dictated text carefully
2. Extract relevant clinical information for each applicable section
3. Only include sections that have relevant content in the dictation
4. Preserve medical terminology and specifics exactly as dictated
5. Format content appropriately (use bullet points for lists, maintain clinical language)
6. If information could belong to multiple sections, place it in the most appropriate one
7. Do NOT add information that was not in the original dictation
8. For Review of Systems (ros_*), look for symptoms mentioned by system
9. For Physical Exam, look for examination findings
10. For Assessment, look for diagnoses or clinical impressions
11. For Plan, look for treatment plans, orders, or follow-up instructions

COMMON DICTATION PATTERNS TO RECOGNIZE:
- "Chief complaint" or "presenting with" or "here for" → chief_complaint
- "History of present illness" or describes symptom onset/duration → hpi
- "Past medical history" or "has a history of" → past_medical_history
- "Surgical history" or "prior surgeries" → past_surgical_history
- "Takes" or "home medications" or "currently on" → home_medications
- "Allergic to" or "allergies include" → allergies
- "Smokes" or "drinks" or "uses" or "works as" → social_history
- "Family history" or "mother/father has" → family_history
- "Denies" or "reports" followed by symptoms → ros_* (appropriate system)
- "On exam" or "physical examination" → physical_exam
- "Impression" or "diagnosis" or "assessment" → assessment
- "Plan" or "will order" or "recommend" → plan

RESPONSE FORMAT:
Return a JSON object with section_id as keys and the parsed content as string values.
Only include sections that have relevant content. Example:

{
  "chief_complaint": "Chest pain for 3 days",
  "hpi": "45-year-old male presenting with substernal chest pain, started 3 days ago, worse with exertion, associated with shortness of breath",
  "family_history": "Father with hypertension, mother with diabetes",
  "physical_exam": "Heart: Regular rate and rhythm, no murmurs. Lungs: Clear to auscultation bilaterally.",
  "assessment": "1. Atypical chest pain\\n2. Rule out ACS",
  "plan": "1. EKG and troponins\\n2. Chest X-ray\\n3. Cardiology consult if positive"
}`;

export const parseDictation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      res.status(400).json({ error: 'Transcript is required' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY not configured');
      res.status(500).json({ error: 'AI service not configured. Please add OPENAI_API_KEY to environment variables.' });
      return;
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Parse the following clinical dictation into H&P sections:\n\n${transcript}` },
      ],
      temperature: 0.2, // Low temperature for consistent parsing
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      res.status(500).json({ error: 'Empty response from AI' });
      return;
    }

    let parsedSections: Record<string, string>;
    try {
      parsedSections = JSON.parse(responseText);
    } catch {
      console.error('Failed to parse AI response as JSON:', responseText);
      res.status(500).json({ error: 'Invalid response format from AI' });
      return;
    }

    // Validate that returned keys are valid section IDs
    const validSectionIds = new Set(HP_SECTIONS.map(s => s.id));
    const validatedSections: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsedSections)) {
      if (validSectionIds.has(key) && typeof value === 'string' && value.trim()) {
        validatedSections[key] = value.trim();
      }
    }

    // Build section metadata for the response
    const sectionMeta = HP_SECTIONS.filter(s => validatedSections[s.id]).map(s => ({
      id: s.id,
      title: s.title,
    }));

    res.json({
      success: true,
      sections: validatedSections,
      sectionMeta,
      sectionCount: Object.keys(validatedSections).length,
    });
  } catch (error: any) {
    console.error('Parse dictation error:', error);

    if (error.code === 'invalid_api_key') {
      res.status(500).json({ error: 'AI service configuration error. Please check the API key.' });
    } else if (error.code === 'rate_limit_exceeded') {
      res.status(429).json({ error: 'AI service rate limit exceeded. Please try again in a moment.' });
    } else if (error.code === 'insufficient_quota') {
      res.status(402).json({ error: 'AI service quota exceeded. Please check your OpenAI account.' });
    } else {
      res.status(500).json({ error: 'Failed to parse dictation. Please try again.' });
    }
  }
};
