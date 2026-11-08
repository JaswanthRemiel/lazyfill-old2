# Clean-room rewrite of the site fillers

This note records how the site-specific form fillers were rewritten, so that anyone reading the repository can see
what was done and what was not.

## Why

An earlier version of these modules was written by reading the compiled source of another extension. The ideas
involved (a profile, matching labels, filling forms) are not owned by anyone, but copying or closely following that
code would be a risk. The modules were therefore replaced by code written without access to the earlier versions.

Replaced modules (all under `src/content/engine/`): `entries.ts`, `sites.ts`, `sites2.ts`, `sites3.ts`, `workday.ts`.
Everything else in the project was written independently and was kept.

## Process

1. **Specification.** [SPEC.md](SPEC.md) was written by the same assistant that had seen the earlier modules. It
   contains two kinds of content only: the required behaviour (what the fillers must do, which result type they
   return, how re-runs behave) and facts about third-party pages (ids, attributes, element names, widget behaviour).
   It contains no code and does not prescribe algorithms, names or structure for the internals.
2. **Isolated workspace.** A separate directory was created holding the project without the five modules, without
   git history, without the code-index folder, and without documentation. It contained the kept source files, the
   existing tests (which were written independently) and the spec.
3. **Implementation by fresh agents.** Five agents with no prior context wrote the new modules from the spec alone:
   one for `entries.ts` plus the shared helpers in `siteKit.ts`, then four in parallel for Workday, the entry point with
   Meta, Google and ByteDance, the form-widget group (Avature, MathWorks, SAP UI5, education), and the ATS group
   (SmartRecruiters, Jobvite, Workable). Each was instructed not to read anything outside the workspace and each
   reported that it had not.
4. **Checks.** The existing test suite had to pass unchanged. Each handler was given its own jsdom tests. A script
   then compared the new files with the old ones: of about 2,000 substantive new lines, 71 were identical to an old
   line and 6 four-line windows matched. Every match was inspected: they are the type unions and function
   signatures that the spec dictated as the public contract, the standard pointer-event click sequence, and one-line
   idioms such as destructuring `parseYearMonth`. No function body is shared.

## Limits (read these)

- This is not a legal opinion and it does not guarantee that no court would see a connection. The spec author had
  seen the earlier code, which is the normal arrangement for a clean-room process, but isolation here was enforced by
  instruction and a separate directory, not by technical sandboxing.
- Markup facts in the spec (ids, data attributes, widget structure) are interoperability facts about other
  companies' pages. They were carried over from the earlier work and have not been re-verified against live sites in
  this process. Sites change; treat each handler as best effort.
- The earlier versions still exist in git history unless history is rewritten.

## Behaviour changes compared with the earlier modules

- SAP UI5 forms: "Reason For Leaving" is no longer filled with an invented value.
- Jobvite: only entries that are missing are added (previously every entry was re-added when any was missing).
- Workable and generic date pickers: the calendar fallback no longer clicks arbitrary nearby buttons.
- Handlers match existing entries by name and complete only empty fields, so a second run changes nothing.
- Education entries on Meta also receive dates and the "currently studying" tick.
