#!/usr/bin/env node

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";

import { Octokit } from "octokit";
import dotenv from "dotenv";

dotenv.config();

const requiredEnvVariables = ["GITHUB_TOKEN", "SOURCE_REPO", "TARGET_REPO"];
for (const envVariable of requiredEnvVariables) {
  if (!process.env[envVariable]) {
    throw new Error(`${envVariable} is not set`);
  }
}

// configuration
const [sourceOwner, sourceRepo] = process.env.SOURCE_REPO.split("/");
const [targetOwner, targetRepo] = process.env.TARGET_REPO.split("/");

// init octokit
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// retrieve all data
const __dirname = dirname(fileURLToPath(import.meta.url));
const QUERY_SOURCE = await readFile(
  join(__dirname, "retrieve-source-repository-data.graphql"),
  "utf-8"
);
const QUERY_TARGET = await readFile(
  join(__dirname, "retrieve-target-repository-data.graphql"),
  "utf-8"
);
const MUTATION_TRANSFER_ISSUE = await readFile(
  join(__dirname, "transfer-issue.graphql"),
  "utf-8"
);

const resultSource = await octokit.graphql(QUERY_SOURCE, {
  owner: sourceOwner,
  repo: sourceRepo,
});
const resultTarget = await octokit.graphql(QUERY_TARGET, {
  owner: targetOwner,
  repo: targetRepo,
});

const targetRepositoryId = resultTarget.repository.id;
const targetLabels = resultTarget.repository.labels.nodes;
const targetMilestones = resultTarget.repository.milestones.nodes;

const issues = resultSource.repository.issues.nodes.map((issue) => {
  return {
    ...issue,
    labels: issue.labels.nodes,
    milestone: issue.milestone
      ? {
          title: issue.milestone.title,
          description: issue.milestone.description
            ? issue.milestone.description
            : "",
          due_on: issue.milestone.dueOn ? issue.milestone.dueOn : undefined,
          state: issue.milestone.state.toLowerCase(),
        }
      : undefined,
  };
});

for (const issue of issues) {
  console.log(
    "Transferring issue #%d (id: %s) to %s/%s",
    issue.number,
    issue.id,
    targetOwner,
    targetRepo
  );

  const result = await octokit.graphql(MUTATION_TRANSFER_ISSUE, {
    repositoryId: targetRepositoryId,
    issueId: issue.id,
  });

  console.log("Transferred to %s", result.transferIssue.issue.url);

  for (const label of issue.labels) {
    // create label in target repository if it doesn't exist yet
    const targetLabel = targetLabels.find(
      (targetLabel) => targetLabel.name === label.name
    );

    if (!targetLabel) {
      const { data } = await octokit.rest.issues.createLabel({
        owner: targetOwner,
        repo: targetRepo,
        ...label,
      });

      console.log(
        'Label "%s" created at https://github.com/%s/%s/issues/labels',
        data.name,
        targetOwner,
        targetRepo
      );
    }
  }

  // assign labels again to transfered issue
  const labels = issue.labels.map((label) => label.name);
  const updateOptions = {
    owner: targetOwner,
    repo: targetRepo,
    issue_number: result.transferIssue.issue.number,
    request: { retries: 3, retryAfter: 2 },
  };
  if (labels.length) {
    console.log("Assigning labels to transferred issue");
    updateOptions.labels = labels;
  }

  if (issue.milestone) {
    const targetMilestone = targetMilestones.find(
      (milestone) => milestone.title === issue.milestone.title
    );
    let newMilestone;

    if (!targetMilestone) {
      const { data } = await octokit.rest.issues.createMilestone({
        owner: targetOwner,
        repo: targetRepo,
        ...issue.milestone,
      });
      newMilestone = data;

      console.log("Milestone %s created at %s", data.title, data.html_url);
    }

    updateOptions.milestone = targetMilestone
      ? targetMilestone.number
      : newMilestone.number;
  }

  if ("labels" in updateOptions || "milestone" in updateOptions) {
    await octokit.rest.issues.update(updateOptions);

    console.log("Transferred issue updated");
  }
}
