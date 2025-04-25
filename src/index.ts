import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { Octokit } from "@octokit/core";
import {
  createAckEvent,
  createDoneEvent,
  createErrorsEvent,
  createTextEvent,
  getUserMessage,
  prompt,
  verifyAndParseRequest,
  createConfirmationEvent,
} from "@copilot-extensions/preview-sdk";

const app = new Hono();

// Simple in-memory session store for brainstorming state
const brainstormingSessions: Record<
  string,
  {
    lastIdea: string;
    promptCount: number;
    lastSuggestion?: string;
    lastPrdRequest?: boolean;
  }
> = {};

app.get("/", (c) => {
  return c.text("Welcome to the Copilot Extension template! 👋");
});

app.post("/", async (c) => {
  // Identify the user, using the GitHub API token provided in the request headers.
  const tokenForUser = c.req.header("X-GitHub-Token") ?? "";

  const body = await c.req.text();
  const signature = c.req.header("x-github-public-key-signature") ?? "";
  const keyID = c.req.header("x-github-public-key-identifier") ?? "";

  const { isValidRequest, payload } = await verifyAndParseRequest(
    body,
    signature,
    keyID,
    {
      token: tokenForUser,
    }
  );

  if (!isValidRequest) {
    console.error("Request verification failed");
    c.header("Content-Type", "text/plain");
    c.status(401);
    return c.text("Request could not be verified");
  }

  if (!tokenForUser) {
    return c.text(
      createErrorsEvent([
        {
          type: "agent",
          message: "No GitHub token provided in the request headers.",
          code: "MISSING_GITHUB_TOKEN",
          identifier: "missing_github_token",
        },
      ])
    );
  }

  c.header("Content-Type", "text/html");
  c.header("X-Content-Type-Options", "nosniff");

  return stream(c, async (stream) => {
    try {
      stream.write(createAckEvent());
      const octokit = new Octokit({ auth: tokenForUser });
      const user = await octokit.request("GET /user");
      const userPrompt = getUserMessage(payload).trim().toLowerCase();
      const userId = user.data.login;

      // Check if user is in a brainstorming session
      if (brainstormingSessions[userId]) {
        // Check for PRD confirmation response
        const potentialConfirmationMessage = payload.messages?.findLast?.(
          (m) =>
            Array.isArray(m.copilot_confirmations) &&
            m.copilot_confirmations.length > 0
        );
        const confirmationState =
          potentialConfirmationMessage?.copilot_confirmations?.[0]?.state;
        if (confirmationState === "accepted") {
          // User accepted to generate PRD
          const featureIdea = brainstormingSessions[userId].lastIdea;
          const suggestion = brainstormingSessions[userId].lastSuggestion || "";
          const [today] = new Date().toISOString().split("T");
          const prdMarkdown = `# Product Requirements Document (PRD)
### Project: **Wacky Product Manager Feature**
**Author:** ${userId}
**Date:** ${today}

## 1. Objective

Suggest a wacky and humorous product feature idea.

## 2. Feature Idea

${featureIdea}

${suggestion ? `## 3. User Suggestion\n\n${suggestion}\n` : ""}

## ${suggestion ? 4 : 3}. Requirements
- The feature should be absurd but plausible in a playful way.
- Should be generated in a humorous tone.
`;
          // Escape triple backticks in the PRD so they render as literal code fences
          const safePrdMarkdown = prdMarkdown.replace(/```/g, "``\u0060");
          stream.write(
            createTextEvent("Here's your PRD document in markdown format:\n")
          );
          stream.write(
            createTextEvent("```markdown\n" + safePrdMarkdown + "\n```\n")
          );
          delete brainstormingSessions[userId];
          stream.write(createDoneEvent());
          return;
        } else if (!confirmationState || confirmationState === "dismissed") {
          // User rejected or dismissed PRD generation
          stream.write(
            createTextEvent(
              "Awesome! Glad you're happy with the feature. If you want to brainstorm again, just type '/feature'."
            )
          );
          delete brainstormingSessions[userId];
          stream.write(createDoneEvent());
          return;
        }
        // Continue brainstorming session
        if (userPrompt.includes("/done")) {
          // Ask for confirmation to generate PRD
          stream.write(
            createConfirmationEvent({
              id: `prd-confirmation-${userId}-${Date.now()}`,
              title: "Generate PRD Document?",
              message:
                "Would you like to generate a markdown Product Requirements Document (PRD) for your finalized idea?",
              metadata: {
                user: userId,
                featureIdea: brainstormingSessions[userId].lastIdea,
                suggestion: brainstormingSessions[userId].lastSuggestion || "",
              },
            })
          );
          return;
        } else if (userPrompt.includes("/new")) {
          brainstormingSessions[userId].promptCount++;
          const { lastIdea, lastSuggestion } = brainstormingSessions[userId];
          const promptText = `Generate another wacky, humorous, but plausible product feature idea. Make it different from this one: \"${lastIdea}\". ${
            lastSuggestion
              ? `Incorporate this user suggestion: \"${lastSuggestion}\".`
              : ""
          } Keep it playful!`;
          const { message } = await prompt(promptText, { token: tokenForUser });
          brainstormingSessions[userId].lastIdea = message.content;
          stream.write(createTextEvent(`Here's another idea:\n`));
          stream.write(createTextEvent(message.content + "\n"));
          stream.write(
            createTextEvent(
              "Reply with '/new' to brainstorm another idea, or '/done' if you're happy, or suggest an improvement!"
            )
          );
          stream.write(createDoneEvent());
          return;
        } else {
          // Treat as a suggestion to improve the feature
          brainstormingSessions[userId].promptCount++;
          brainstormingSessions[userId].lastSuggestion = userPrompt;
          const { lastIdea } = brainstormingSessions[userId];
          const promptText = `Refine this wacky, humorous, but plausible product feature idea: \"${lastIdea}\". Incorporate this user suggestion: \"${userPrompt}\". Keep it playful!`;
          const { message } = await prompt(promptText, { token: tokenForUser });
          brainstormingSessions[userId].lastIdea = message.content;
          stream.write(
            createTextEvent(
              `Here's an improved idea based on your suggestion:\n`
            )
          );
          stream.write(createTextEvent(message.content + "\n"));
          stream.write(
            createTextEvent(
              "Reply with '/new' to brainstorm another idea, or '/done' if you're happy, or suggest another improvement!"
            )
          );
          stream.write(createDoneEvent());
          return;
        }
      }

      // Command parsing for wackyproductmanager
      if (userPrompt.includes("/feature")) {
        // Start brainstorming session
        const promptText =
          "Generate a wacky, humorous, but plausible product feature idea in a playful tone.";
        const { message } = await prompt(promptText, { token: tokenForUser });
        brainstormingSessions[userId] = {
          lastIdea: message.content,
          promptCount: 1,
        };
        stream.write(
          createTextEvent(
            `No problem ${user.data.login}! Let's brainstorm.\n\n`
          )
        );
        stream.write(createTextEvent(message.content + "\n"));
        stream.write(
          createTextEvent(
            "Reply with 'new' to brainstorm another idea, or 'done' if you're happy with the feature!"
          )
        );
        stream.write(createDoneEvent());
        return;
      }

      // Default fallback
      stream.write(
        createTextEvent(
          `Hi ${user.data.login}! The options you have are asking me about a feature request or a product idea. Type '/feature' to get a wacky product idea!`
        )
      );

      stream.write(createDoneEvent());
    } catch (error) {
      stream.write(
        createErrorsEvent([
          {
            type: "agent",
            message: error instanceof Error ? error.message : "Unknown error",
            code: "PROCESSING_ERROR",
            identifier: "processing_error",
          },
        ])
      );
    }
  });
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
