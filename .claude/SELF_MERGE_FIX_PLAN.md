# Self-Merge Detection Fix Plan

## Problem Statement

Current behavior: The tool flags ALL pull requests where `author === merged_by` as self-merge security issues.

Intended behavior: Only flag self-merges as issues when NO other parties have reviewed the PR.

**Rationale**: A self-merge with proper review from other team members is acceptable. The security concern is when someone merges their own code without any external review.

## Current Implementation

**File**: `src/analyzers/security-analyzer.ts`
**Method**: `analyzeSelfMerges(pullRequests: PullRequest[])`

```typescript
analyzeSelfMerges(pullRequests: PullRequest[]): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  
  for (const pr of pullRequests) {
    if (pr.author === pr.merged_by && pr.merged_by !== null) {
      issues.push({
        type: 'self-merge',
        severity: pr.is_security_related ? 'high' : 'medium',
        // ...
      });
    }
  }
  
  return issues;
}
```

## Proposed Solution

### 1. Extend PullRequest Type

Add review information to the `PullRequest` interface:

```typescript
export interface PullRequest {
  // ... existing fields ...
  reviewers?: string[];  // List of users who reviewed (excluding author)
  review_count?: number; // Count of reviews from other users
}
```

### 2. Update GitHubFetcher

Enhance `getRecentPullRequests()` to fetch review data for each PR:

```typescript
async getRecentPullRequests(daysBack = 30): Promise<PullRequest[]> {
  // ... existing repo/PR fetching logic ...
  
  // For each PR, fetch reviews
  const { data: reviews } = await this.octokit.pulls.listReviews({
    owner: this.org,
    repo: repo.name,
    pull_number: pr.number,
  });
  
  // Filter out reviews by the author themselves
  const reviewers = reviews
    .filter(review => review.user?.login !== pr.user?.login)
    .map(review => review.user?.login)
    .filter((login): login is string => login !== undefined);
  
  // Deduplicate reviewers
  const uniqueReviewers = [...new Set(reviewers)];
  
  allPRs.push({
    // ... existing fields ...
    reviewers: uniqueReviewers,
    review_count: uniqueReviewers.length,
  });
}
```

### 3. Update Security Analyzer

Modify `analyzeSelfMerges()` to check for reviews:

```typescript
analyzeSelfMerges(pullRequests: PullRequest[]): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  
  for (const pr of pullRequests) {
    const isSelfMerged = pr.author === pr.merged_by && pr.merged_by !== null;
    const hasNoReviews = !pr.reviewers || pr.reviewers.length === 0;
    
    // Only flag if self-merged AND no other reviewers
    if (isSelfMerged && hasNoReviews) {
      issues.push({
        type: 'self-merge',
        severity: pr.is_security_related ? 'high' : 'medium',
        repository: pr.repository,
        description: `PR #${pr.number} was self-merged by ${pr.author} with no reviews`,
        details: {
          pr_number: pr.number,
          title: pr.title,
          url: pr.url,
          author: pr.author,
          merged_at: pr.merged_at ?? undefined,
          is_security_related: pr.is_security_related,
          review_count: pr.review_count ?? 0,
          reviewers: pr.reviewers ?? [],
        },
        detected_at: new Date().toISOString(),
      });
    }
  }
  
  return issues;
}
```

## Performance Considerations

### Issue: API Rate Limiting

Fetching reviews for each PR adds an additional API call per PR. This could cause rate limiting issues for organizations with many PRs.

### Mitigation: Bounded Concurrency

Use the same bounded concurrency pattern we implemented for `getOrgMembers()`:

```typescript
// Process PRs in batches to avoid rate limiting
const concurrencyLimit = 5;
for (let i = 0; i < prs.length; i += concurrencyLimit) {
  const batch = prs.slice(i, i + concurrencyLimit);
  const batchResults = await Promise.all(
    batch.map(async (pr) => {
      // Fetch PR reviews
      // Return enhanced PR object
    })
  );
  allPRs.push(...batchResults);
}
```

## Testing Strategy

### Unit Tests

Update existing tests in `src/__tests__/security-analyzer.test.ts`:

1. **Test: Self-merge WITH reviews (should NOT flag)**
   ```typescript
   it('should not flag self-merge when PR has reviews from others', () => {
     const pr = {
       author: 'alice',
       merged_by: 'alice',
       reviewers: ['bob', 'charlie'],
       review_count: 2,
       // ...
     };
     const issues = analyzer.analyzeSelfMerges([pr]);
     expect(issues).toHaveLength(0);
   });
   ```

2. **Test: Self-merge WITHOUT reviews (should flag)**
   ```typescript
   it('should flag self-merge when PR has no reviews', () => {
     const pr = {
       author: 'alice',
       merged_by: 'alice',
       reviewers: [],
       review_count: 0,
       // ...
     };
     const issues = analyzer.analyzeSelfMerges([pr]);
     expect(issues).toHaveLength(1);
     expect(issues[0].description).toContain('no reviews');
   });
   ```

3. **Test: Merged by someone else (should NOT flag)**
   ```typescript
   it('should not flag when merged by someone else', () => {
     const pr = {
       author: 'alice',
       merged_by: 'bob',
       reviewers: [],
       // ...
     };
     const issues = analyzer.analyzeSelfMerges([pr]);
     expect(issues).toHaveLength(0);
   });
   ```

## Implementation Steps

1. ✅ Create new branch: `claude/fix-self-merge-review-logic-H5bVu`
2. Update `src/types/index.ts` - Add `reviewers` and `review_count` to `PullRequest`
3. Update `src/services/github-fetcher.ts` - Fetch review data for each PR
4. Update `src/analyzers/security-analyzer.ts` - Check for reviews before flagging
5. Update `src/__tests__/security-analyzer.test.ts` - Add new test cases
6. Run full test suite and verify
7. Update documentation if needed
8. Commit and push

## Edge Cases to Handle

1. **PR with only author's own reviews**: Should be flagged (no external review)
2. **PR with review comments but no approval**: May need to consider comment reviews
3. **PR with requested reviewers but no actual reviews**: Should be flagged
4. **Bot reviews (dependabot, etc.)**: Should we count bot reviews? (Probably not)

## API Endpoints Used

- `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews` - List reviews on a PR
  - Returns array of review objects with `user.login`, `state`, `submitted_at`
  - Review states: 'APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'

## Alternative: Use Review Requests

Could also check for requested reviewers:
- `GET /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers`

However, this doesn't tell us if they actually reviewed, just if they were requested.

## Recommendation

Implement the review-based approach as outlined. Consider all review types (APPROVED, CHANGES_REQUESTED, COMMENTED) as valid reviews from others, as they all indicate external oversight.
