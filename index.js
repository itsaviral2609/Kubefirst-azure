const MIN_REQUIRED_APPROVALS = 1; // Set the minimum number of required approvals

/**
 * Main entry point for the Kubefirst-bot
 * @param {import('probot').Probot} app
 */
export default (app) => {
  app.log.info("Kubefirst-bot loaded successfully!");

  // Handle PR review submitted, issue comment created, and pull request opened events
  app.on(
    ["pull_request_review.submitted", "issue_comment.created", "pull_request.opened"],
    async (context) => {
      await handlePRCommands(context);
    }
  );

  // Automatically assign the repository owner as a reviewer when a new PR is opened
  app.on("pull_request.opened", async (context) => {
    await assignReviewer(context);
  });
};

/**
 * Function to handle PR commands from comments
 * @param {import('probot').Context} context
 */
async function handlePRCommands(context) {
  const commentBody = context.payload.comment
    ? context.payload.comment.body
    : "";
  const prNumber = context.payload.issue ? context.payload.issue.number : null;
  const commenter = context.payload.comment.user.login;

  if (!commentBody || !prNumber) return;

  // Check if the comment is from the bot itself
  const botUsername = "kubefirst-bot[bot]";
  if (commenter === botUsername) {
    context.log.info("Ignoring comment from the bot itself to prevent infinite loop.");
    return;
  }

  // Check if the commenter is a maintainer or the bot itself
  const isMaintainer = await checkMaintainerOrBot(context, commenter);
  if (!isMaintainer) {
    await context.octokit.issues.createComment(
      context.issue({
        body: `❌ @${commenter}, you do not have permission to use this command. Only maintainers and the bot can use this command.`,
      })
    );
    return;
  }

  // Check for duplicate command usage
  const isDuplicateCommand = await checkDuplicateCommand(context, commenter, commentBody);
  if (isDuplicateCommand) {
    await context.octokit.issues.createComment(
      context.issue({
        body: `@${commenter}, you have already used this command in the thread.`,
      })
    );
    return;
  }

  // Execute the corresponding command
  if (commentBody==="/approve") {
    await approvePR(context, prNumber, commenter);
  }

  if (commentBody==="/hold") {
    await holdPR(context, prNumber);
  }

  if (commentBody==="/unhold") {
    await unholdPR(context, prNumber);
  }
}

/**
 * Check for duplicate command usage in the comment thread
 * @param {import('probot').Context} context
 * @param {string} commenter
 * @param {string} commentBody
 * @returns {Promise<boolean>}
 */
async function checkDuplicateCommand(context, commenter, commentBody) {
  try {
    const { data: comments } = await context.octokit.issues.listComments(
      context.repo({ issue_number: context.payload.issue.number })
    );

    // Check if the same user (commenter) has already used the same command in the thread
    // console.log(comments)
    

    return comments.some(
      (comment, idx) =>
        comment.user.login === commenter &&
        comment.body === commentBody &&
        idx !== comments.length - 1
    )
  } catch (error) {
    context.log.error(`Failed to check for duplicate command usage: ${error.message}`);
    return false;
  }
}

/**
 * Approve the PR if it meets the required review criteria and auto-merge if criteria are met
 * @param {import('probot').Context} context
 * @param {number} prNumber
 * @param {string} commenter
 */
async function approvePR(context, prNumber, commenter) {
  const pr = await context.octokit.pulls.get(
    context.repo({ pull_number: prNumber })
  );
  const reviews = await context.octokit.pulls.listReviews(
    context.repo({ pull_number: prNumber })
  );

  // Check if PR is on hold
  const isHeld = pr.data.labels.some((label) => label.name === "hold");
  if (isHeld) {
    await context.octokit.issues.createComment(
      context.issue({
        body: "This PR is on hold and cannot be merged until the hold is removed.",
      })
    );
    return;
  }

  // Check if PR is a draft
  if (pr.data.draft) {
    await context.octokit.issues.createComment(
      context.issue({
        body: "This PR is a draft and cannot be approved. Please mark it as ready for review before approving.",
      })
    );
    return;
  }

  // Avoid duplicate approvals from the same user
  const hasAlreadyApproved = reviews.data.some(
    (review) => review.user.login === commenter && review.state === "APPROVED"
  );
  if (hasAlreadyApproved) {
    await context.octokit.issues.createComment(
      context.issue({
        body: `@${commenter}, you have already approved this PR.`,
      })
    );
    return;
  }

  // Create an approval review
  try {
    await context.octokit.pulls.createReview({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      pull_number: prNumber,
      event: "APPROVE",
      body: "Approved via /approve command.",
    });
    context.log.info(`Approval review created for PR #${prNumber} via /approve command.`);
  } catch (error) {
    await context.octokit.issues.createComment(
      context.issue({
        body: `❌ Failed to create an approval review: ${error.message}`,
      })
    );
    return;
  }

  // Check approval count and merge if criteria are met
  const approvedReviews = reviews.data.filter(
    (review) => review.state === "APPROVED"
  );
  const approvalCount = approvedReviews.length + 1;

  if (approvalCount >= MIN_REQUIRED_APPROVALS) {
    try {
      await context.octokit.pulls.merge(context.repo({ pull_number: prNumber }));
      await context.octokit.issues.createComment(
        context.issue({
          body: `✅ PR #${prNumber} has met the required approvals and has been merged automatically.`,
        })
      );
    } catch (error) {
      await context.octokit.issues.createComment(
        context.issue({
          body: `❌ Failed to merge the pull request: ${error.message}`,
        })
      );
    }
  } else {
    await context.octokit.issues.createComment(
      context.issue({
        body: `This PR requires at least ${MIN_REQUIRED_APPROVALS} approvals before it can be merged. Current approvals: ${approvalCount}.`,
      })
    );
  }
}

/**
 * Check if the user is a maintainer of the repository or the bot itself
 * @param {import('probot').Context} context
 * @param {string} username
 */
async function checkMaintainerOrBot(context, username) {
  console.log(username)
  try {
    const botUsername = "kubefirst-bot[bot]"
    const ownerusername = context.payload.repository.owner.login;
    if (username === botUsername || username === ownerusername) {
      return true;
    }

    const { data: collaborators } = await context.octokit.repos.listCollaborators(
      context.repo({ affiliation: "direct" })
    );
    console.log(collaborators)
    return collaborators.some(
      (collaborator) =>
        collaborator.login === username 
    );
  } catch (error) {
    context.log.error(`Failed to check maintainer status: ${error.message}`);
    return false;
  }
}

/**
 * Add a 'hold' label to the PR
 * @param {import('probot').Context} context
 * @param {number} prNumber
 */
async function holdPR(context, prNumber) {
  await context.octokit.issues.addLabels(
    context.repo({
      issue_number: prNumber,
      labels: ["hold"],
    })
  );
  context.log.info(`PR #${prNumber} has been placed on hold.`);
}

/**
 * Remove the 'hold' label from the PR
 * @param {import('probot').Context} context
 * @param {number} prNumber
 */
async function unholdPR(context, prNumber) {
  try {
    await context.octokit.issues.removeLabel(
      context.repo({
        issue_number: prNumber,
        name: "hold",
      })
    );
    context.log.info(`PR #${prNumber} has been unheld and is ready for approval.`);
  } catch (error) {
    context.log.error(`Failed to remove 'hold' label from PR #${prNumber}: ${error.message}`);
  }
}
