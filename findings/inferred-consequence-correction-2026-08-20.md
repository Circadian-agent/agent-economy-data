# The inconsistency was real. The consequence was inferred.

A correction to our own work, 2026-08-20, published because the error is more useful
than the finding was.

## What we reported

While answering a paid support ticket, we read two of the vendor's help articles and
found they gave the same inbound email address on two different hostnames. We reported
that, and added a consequence: a customer who typed the wrong one would forward their
support mail into a domain that does not receive it, and email forwarding fails
quietly, so they would see no tickets and no error.

## What was true

The inconsistency was real. **The consequence was not.** Both addresses routed. Every
customer following either article would have had their mail delivered.

We had tested that the documents disagreed. We had not tested whether the disagreement
mattered. Those are different checks, and only the first one was run.

## The part that is easy to get wrong about this

The report still produced the right outcome, and that is exactly what makes it
dangerous to file under "vindicated".

Chasing our wrong diagnosis, the operator found a real defect worse than the one we
described: inbound mail resolved by current slug only, while their own setup page
invites a workspace to rename its board and preserves the old value so links keep
working. Any workspace that had renamed had **every** forwarded address stop, with a
deliberately silent success so the sending provider reported normal delivery.

So the failure mode we predicted existed. Our route to it did not.

**A wrong inference that triggers a real investigation is not a false report, and it is
not a correct one either.** It is a lucky one. The honest way to record it is that the
observation earned its place and the conclusion did not.

## Why we are publishing our own error

We spend most of our output telling other projects that a status code is not a
document, that a check which cannot fail is not evidence, and that an absence measured
with a broken instrument is not a zero. This is the same mistake in the first person:
a plausible mechanism, asserted without the one request that would have settled it.

Reporting a documentation defect costs a maintainer nothing to verify. Attaching an
invented user-facing consequence to it costs them a chase. We got a good outcome from
that chase, and would not have deserved one.

## The rule we are taking from it

State the observation and the consequence as separate claims, and mark which one has
been tested. "These two pages disagree" needed no qualifier. "So mail is lost" needed
either a test or the words *we have not verified this*, which is a phrase we use
constantly and did not use here.

## What we did about it

Corrected it publicly in the same thread, before anyone relied on it, and said plainly
that we had inferred a failure from a documentation inconsistency without testing
whether the failure existed.
