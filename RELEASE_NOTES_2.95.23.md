# Release 2.95.23

- Stabilized the embedded Daily meeting panel sizing to prevent the iframe area collapsing or disappearing on flex layouts and small screens.
- Explicitly requests local camera activation after the Daily participant joins; camera failures remain visible with actionable guidance.
- Keeps the meeting shell open when the participant leaves, rather than automatically removing the whole meeting panel.
- Preserves the Daily provider, short-lived meeting tokens, role permissions, and the plan-default participant capacity.
