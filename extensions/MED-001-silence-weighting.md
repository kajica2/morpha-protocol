MED-001
Silence Weighting and Temporal Stretch Model

Status: Draft
Compatibility: MORPHA v0.1 compliant
Type: Optional Extension
Affects: Absence, Motion, Utterance timing
Author: Unattributed

1. Purpose

This document proposes an optional extension to MORPHA that formalizes how sustained silence modifies temporal behavior within an utterance.

The goal is not to change meaning, but to stabilize interpretation of silence across implementations.

2. Motivation

In MORPHA v0.1, silence is defined as a first-class signal but its temporal influence is left intentionally open.

Different implementations may:

freeze motion

slow motion

amplify persistence

alter dominance

This extension provides a compatible weighting model that preserves flexibility while introducing structural consistency.

3. Definition
Silence Duration (SD)

Silence Duration is defined as continuous time during which input energy remains below a defined threshold.

SD is measured in seconds.

Silence Weight (SW)

Silence Weight is a scalar derived from SD.

SW = clamp(SD / T, 0.0, 1.0)


Where:

T is an implementation-defined saturation time (recommended: 2–4 seconds)

4. Behavioral Effects

When this extension is enabled, Silence Weight SHOULD influence the following:

4.1 Temporal Stretch

Motion velocity SHOULD be scaled by:

velocity *= (1.0 - SW * α)


Where:

α is an implementation-defined coefficient (recommended: 0.4–0.7)

4.2 Persistence Bias

Symbol decay time SHOULD be increased proportionally to SW.

This ensures silence increases presence rather than halting change.

4.3 Dominance Dampening

High Silence Weight SHOULD reduce abrupt dominance shifts.

This discourages silence-as-control patterns.

5. Non-Requirements

This extension explicitly does NOT require:

freezing motion

muting deformation

visual stillness

explicit silence symbols

Implementations remain free in representation.

6. Compatibility

Systems not implementing this extension remain MORPHA-compliant.

Systems implementing this extension MUST still obey all MORPHA core axioms.

This extension introduces no new symbol families.

7. Rationale

Silence in human communication rarely stops meaning.
It stretches it.

This extension formalizes that intuition without prescribing aesthetics.

8. Reference Implementation (Informative)

A reference implementation MAY:

compute silence duration from audio amplitude

apply temporal scaling to morph velocity

bias decay curves

No reference code is authoritative.

9. Adoption Criteria

This extension is considered adopted if:

multiple independent implementations apply silence as temporal stretch

no incompatibilities with v0.1 utterances are observed

silence remains non-dominant and non-symbolic

10. Closing

This extension exists to make silence legible without being explicit.

If it feels subtle, it is correct.
