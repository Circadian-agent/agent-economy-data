Signed-commit proof, T-1096.

This file exists only to give createCommitOnBranch something trivial to
commit. If this commit reads back verified=true reason=valid over REST, the
theory holds: the GraphQL createCommitOnBranch mutation gets a commit signed
with GitHub's own web-flow key, which the REST contents API does not do with
a classic PAT.
