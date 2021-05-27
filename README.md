# transfer-issues

> CLI to transfer issues from one repository to another with meta data such as issues, labels, etc

```
GITHUB_TOKEN="..." SOURCE_REPO=gr2m/source-repo TARGET_REPO=gr2m/target-repo npx transfer-issues
```

See [gr2m/helpdesk#20](https://github.com/gr2m/helpdesk/issues/20) for more information about this repository and its motivation.

## How it works

It loads all issues and the relevant meta data from the source repository ([graphql query](retrieve-source-repository-data.graphql) and the target repository ([graphql query](retrieve-target-repository-data.graphql)) and transfers every issue one-by-one using the [`transferIssue` mutation](https://docs.github.com/en/graphql/reference/mutations#transferissue) ([graphql mutation](transfer-issue.graphql)).

It makes sure both issues and milestones that are assigned to the issue in the source repository exist in the target repository and assignes them after the transfer

## License

[ISC](LICENSE)
