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

app.get("/", (c) => {
  return c.text("Welcome to the Copilot Extension template! 👋");
});

app.post("/", async (c) => {
  // Identify the user, using the GitHub API token provided in the request headers.
  const tokenForUser = c.req.header("X-GitHub-Token") ?? "";

  const body = await c.req.text();
  const signature = c.req.header("github-public-key-signature") ?? "";
  const keyID = c.req.header("github-public-key-identifier") ?? "";

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
      const userPrompt = getUserMessage(payload);

      // Command parsing for wackyproductmanager
      if (
        userPrompt.trim().startsWith("@wackyproductmanager feature-request")
      ) {
        // Generate a wacky feature idea using the prompt API (e.g., GPT-4)
        const { message } = await prompt(
          "Generate a wacky, humorous, but plausible product feature idea in a playful tone.",
          { token: tokenForUser }
        );
        stream.write(
          createTextEvent(
            `Wacky Product Manager Suggestion: ${message.content}`
          )
        );
        stream.write(createDoneEvent());
        return;
      }

      if (userPrompt.trim().startsWith("@wackyproductmanager create-issue")) {
        stream.write(
          createTextEvent(
            "What type of issue would you like to create? (bug, feature, general request)"
          )
        );
        const { message: issueTypeMsg } = await prompt(
          "User will reply with the issue type and description. Parse and use it.",
          { token: tokenForUser }
        );
        const match = issueTypeMsg.content.match(
          /^(bug|feature|general)\s*:\s*(.+)$/i
        );
        if (!match) {
          stream.write(
            createErrorsEvent([
              {
                type: "agent",
                message:
                  "Could not parse issue type and description. Please reply with 'bug: ...', 'feature: ...', or 'general: ...'",
                code: "INVALID_ISSUE_FORMAT",
                identifier: "invalid_issue_format",
              },
            ])
          );
          stream.write(createDoneEvent());
          return;
        }
        const [, issueType, issueDesc] = match;
        // Confirmation dialog (fix: only 'message' is supported, not 'buttons')
        const confirmation = await createConfirmationEvent({
          message: `Are you sure you want to create this ${issueType} issue in GitHub?`,
        });
        if (confirmation !== "confirm") {
          stream.write(createTextEvent("Issue creation cancelled."));
          stream.write(createDoneEvent());
          return;
        }
        // Get repo context from payload if available (fix: use payload.repository?.name and payload.repository?.owner?.login)
        const repo = payload?.repository?.name;
        const owner = payload?.repository?.owner?.login;
        if (!repo || !owner) {
          stream.write(
            createErrorsEvent([
              {
                type: "agent",
                message: "Could not determine repository context.",
                code: "MISSING_REPO_CONTEXT",
                identifier: "missing_repo_context",
              },
            ])
          );
          stream.write(createDoneEvent());
          return;
        }
        // Compose issue
        let title =
          issueType.charAt(0).toUpperCase() +
          issueType.slice(1) +
          ": " +
          issueDesc.split(".")[0];
        let body = issueDesc;
        // Optionally add file/line context if available (fix: use payload.context?.file, payload.context?.startLine, payload.context?.endLine)
        if (payload?.context?.file) {
          body += `\n\nFile: ${payload.context.file}`;
          if (
            payload.context.startLine !== undefined &&
            payload.context.endLine !== undefined
          ) {
            body += ` (Lines ${payload.context.startLine + 1}-${
              payload.context.endLine + 1
            })`;
          }
        }
        // Labels
        const labels = [issueType.toLowerCase()];
        try {
          await octokit.request("POST /repos/{owner}/{repo}/issues", {
            owner,
            repo,
            title,
            body,
            labels,
          });
          stream.write(
            createTextEvent(`GitHub issue created successfully: ${title}`)
          );
        } catch (err) {
          stream.write(
            createErrorsEvent([
              {
                type: "agent",
                message:
                  err instanceof Error
                    ? err.message
                    : "Failed to create GitHub issue.",
                code: "GITHUB_ISSUE_ERROR",
                identifier: "github_issue_error",
              },
            ])
          );
        }
        stream.write(createDoneEvent());
        return;
      }

      // Default fallback
      const { message } = await prompt(userPrompt, {
        token: tokenForUser,
      });
      stream.write(createTextEvent(`Hi ${user.data.login}! `));
      stream.write(createTextEvent(message.content));
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
