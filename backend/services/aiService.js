const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a new goal and its subtasks using OpenAI.
 * The AI acts as a mentor, breaking down the user prompt into achievable daily tasks.
 * @param {string} prompt User's input describing what they want to achieve.
 * @returns {Object} JSON payload of { goal: { title, description, deadline, dailyAvailableHours }, tasks: [{ title, description, durationHours }] }
 */
const generateGoalWithTasks = async (prompt) => {
  const systemPrompt = `
You are an expert productivity mentor named Chronify. 
Your job is to take a user's rough goal ('prompt') and break it down into a structured, achievable project plan.
Analyze the user's prompt to determine a realistic deadline and a daily time commitment.
Then, break the goal down into distinct tasks. 
Return ONLY valid JSON matching this exact structure:
{
  "goal": {
    "title": "Clear, actionable title of the goal",
    "description": "Short motivational description",
    "deadlineDays": Number (how many days from today this should take),
    "dailyAvailableHours": Number (recommended hours per day, e.g., 2)
  },
  "tasks": [
    {
      "title": "Specific task title",
      "description": "What exactly to do in this task",
      "durationHours": Number (estimated hours, e.g. 1.5)
    }
  ]
}
Do not include markdown blocks like \`\`\`json. Just the raw JSON object.`;

  let response;
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
    });
  } catch (error) {
    // Normalize OpenAI errors so our global handler returns the right status/message
    if (error?.status === 429 || error?.code === 'insufficient_quota') {
      const err = new Error(
        'AI quota exhausted. Please check OpenAI billing/plan or update the API key.'
      );
      err.statusCode = 429;
      throw err;
    }
    if (error?.status === 401) {
      const err = new Error('Invalid OpenAI API key.');
      err.statusCode = 401;
      throw err;
    }
    error.statusCode = error?.status || 500;
    throw error;
  }

  const rawJson = response.choices[0].message.content.trim();
  try {
    const data = JSON.parse(rawJson);
    return data;
  } catch (err) {
    console.error('Failed to parse AI response as JSON:', rawJson);
    throw new Error('AI produced invalid response format');
  }
};

/**
 * Get step-by-step suggestions/mentorship for a specific task.
 * @param {string} taskTitle Title of the task.
 * @param {string} taskDescription Description of the task.
 * @returns {string} Markdown formatted guidance.
 */
const suggestTaskBreakdown = async (taskTitle, taskDescription) => {
  const systemPrompt = `
You are an expert productivity mentor named Chronify.
Your student is working on a specific task. Provide a brief, highly actionable bulleted list of step-by-step instructions or tips on how to successfully and efficiently complete this task. 
Use markdown formatting to make it easy to read. 
Keep it concise, encouraging, and directly focused on the task at hand.`;

  const userPrompt = `Task Title: ${taskTitle}\nDescription: ${taskDescription || 'None'}\n\nPlease guide me on how to do this.`;

  let response;
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
    });
  } catch (error) {
    if (error?.status === 429 || error?.code === 'insufficient_quota') {
      const err = new Error(
        'AI quota exhausted. Please check OpenAI billing/plan or update the API key.'
      );
      err.statusCode = 429;
      throw err;
    }
    if (error?.status === 401) {
      const err = new Error('Invalid OpenAI API key.');
      err.statusCode = 401;
      throw err;
    }
    error.statusCode = error?.status || 500;
    throw error;
  }

  return response.choices[0].message.content;
};

module.exports = {
  generateGoalWithTasks,
  suggestTaskBreakdown,
};
