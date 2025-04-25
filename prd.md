# Product Requirements Document (PRD)
### Project: **Wacky Product Manager GitHub Copilot Extension**
**Author:** Nick Taylor
**Date:** 2025-04-24

## 1. Objective

The goal is to create a **GitHub Copilot extension** called **Wacky Product Manager** that:
- Suggests **wacky and humorous product feature ideas** when prompted by the user.
- Allows users to create **GitHub issues for bugs or feature requests** directly from within the Copilot extension.
- Leverages the **GitHub Copilot Preview SDK** and **GitHub API** to create issues in GitHub repositories based on user input or detected bugs.
- Uses the user's **GitHub token** (via Copilot authentication) to perform actions on behalf of the user without requiring additional sign-ins.

## 2. Features

### Wacky Product Manager Feature Suggestions
- **Command:** `@wackyproductmanager feature-request`
  - **Behavior**: When a user types this command, the extension generates a **wacky product feature idea** in a humorous tone. The feature should be absurd but plausible in a playful way.
  - **Example:** "Add a feature where users can high-five the app to unlock a surprise mode that turns all text into pirate-speak."

### Issue Creation: Bug, Feature, or General Requests
- **Command:** `@wackyproductmanager create-issue`
  - **Behavior**: When the user requests an issue creation, the extension will prompt them to specify the type of issue (bug, feature, or general request).
  - **Sub-features**:
    - **Bug Detection**: If the user detects a bug or specifies a bug, the extension will automatically generate a GitHub issue related to the bug in the current file.
    - **Feature Request**: Users can also request a feature to be logged in GitHub with contextual details (e.g., file name, line numbers).
    - **Confirmation Prompt**: Before creating the issue, a **confirmation dialog** will ask users to confirm their intent to create the issue using `createConfirmationEvent` from the Copilot Preview SDK.

### Context Access
- **File and Lines Access**: The extension will access the current file and line numbers where the user is working. This will allow the extension to link issues to specific locations in the codebase.
- **GitHub Token**: The extension will leverage the GitHub token obtained through Copilot authentication to create issues in the user’s GitHub repositories without requiring further authentication.

## 3. Functional Requirements

### 1. Feature Request Handling:
- The extension should generate a **random wacky product feature** each time the user requests a feature suggestion.
- Use an API (e.g., OpenAI GPT-4 or similar) to generate a humorous feature suggestion based on the user’s request.

### 2. Issue Creation:
- The extension should prompt the user for the type of issue they want to create (bug, feature, general request).
- Once confirmed, the extension should use the GitHub API to create an issue in the current repository:
  - **Title**: "Bug: Description of the bug"
  - **Body**: Description of the bug, including file and line context if available.
  - The issue will be tagged with labels such as "bug" or "feature" based on the user’s selection.

### 3. User Confirmation Flow:
- Before creating the issue, the extension will use `createConfirmationEvent` from the **GitHub Copilot Preview SDK** to display a confirmation prompt to the user.
- **User Confirmation Steps**:
  - **Prompt**: "Are you sure you want to create this issue in GitHub?"
  - **Actions**: Users can confirm or cancel the action.

### 4. GitHub API Integration:
- The extension will use the **GitHub Issues API** to create issues in the corresponding GitHub repository.
- The **GitHub token** will be used for authentication, ensuring that actions are performed on behalf of the user.

## 4. Non-Functional Requirements

### 1. User Interface (UI):
- The extension will interact with the **GitHub Copilot UI**.
  - **Feature Request**: Will display a text output or chat-based message with the wacky feature suggestion.
  - **Issue Creation Confirmation**: A pop-up or dialog will confirm the creation of the issue before proceeding.

### 2. Performance:
- The extension must respond to commands (`@wackyproductmanager feature-request`, `@wackyproductmanager create-issue`) promptly.
- The interaction for creating issues should take no more than a few seconds after the user confirms the action.

### 3. Error Handling:
- If there are any issues creating an issue (e.g., network error, missing repository access), the extension should display a **clear error message** and allow the user to retry or provide feedback.

### 4. Security and Privacy:
- Ensure that **GitHub tokens** are used securely, leveraging Copilot's authentication mechanisms.
- All user data should be handled in compliance with GitHub’s privacy and security policies.

## 5. Technical Specifications

### 1. Copilot Extension Template:
- Use the **Copilot Extension Template** as the base framework for the extension.
- Implement the commands (`@wackyproductmanager feature-request`, `@wackyproductmanager create-issue`) as extensions of the template.

### 2. GitHub API Integration:
- The extension will interact with the GitHub Issues API to create issues. This requires an **access token** with **repo** scope.
- Endpoint:
  `POST https://api.github.com/repos/{owner}/{repo}/issues`
- The request body will include the **title**, **body**, and **labels**.

### 3. Copilot Preview SDK:
- The **`createConfirmationEvent`** from the **GitHub Copilot Preview SDK** will be used to trigger the user confirmation flow.
- Example of using `createConfirmationEvent`:

  ```javascript
  const createConfirmation = async (message) => {
    const confirmation = await createConfirmationEvent({
      message: message,
      buttons: [
        { label: "Confirm", action: "confirm" },
        { label: "Cancel", action: "cancel" },
      ],
    });

    if (confirmation.action === "confirm") {
      // Proceed to create the GitHub issue
    } else {
      // Cancel the action
    }
  };
