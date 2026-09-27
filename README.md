# Կենսաբանության փորձնական թեստ

Static GitHub Pages application with four clearly separated biology sections: question-bank practice, unified entrance exams, voluntary teacher attestation, and regular/mandatory teacher attestation information.

## Features

- 86 selectable question-bank practice variants
- 3,421 four-option questions from question-bank parts 1–4
- 408 numeric short-answer problems from question-bank part 4
- 20 real unified entrance-exam variants from 2024 and 2025, imported from 20 ԳԹԿ exam PDFs and 5 final answer keys
- 9 voluntary teacher-attestation variants from 2022–2024, imported from 9 ԳԹԿ exam PDFs and 3 final answer keys
- Unified exams, voluntary attestation, and regular/mandatory attestation are never mixed
- The regular/mandatory attestation section is informational because no comparable official standardized biology paper plus answer key was verified
- Published exams preserve single-choice, matching, ordering, multiple-selection, numeric, and true/false tasks
- Diagram pages from the official Tavush papers are included as local images
- Question-bank tests contain 40 multiple-choice and 20 short-answer questions; unified tests contain 70 numbered tasks and 80 separately scored responses; voluntary-attestation tests contain 60 tasks
- Answer positions are shuffled independently whenever a test starts
- Persistent local result history keeps repeated attempts of the same test as separate entries
- Starting the same test again guarantees a different option order from its most recent completed attempt
- Three-hour countdown and refresh recovery with `localStorage`
- Progress navigation for every scored response
- Final score split by question type
- Detailed review showing the selected/entered answer and the official correct answer
- Responsive desktop and mobile layout
- No login, server, database, build tool, or external runtime dependency

## Run locally

From this directory:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## GitHub Pages

Commit `index.html`, `styles.css`, `app.js`, `question-bank.js`, `official-exams.js`, `voluntary-attestation.js`, `.nojekyll`, and `assets/`. In the repository settings, open **Pages**, choose **Deploy from a branch**, select the main branch and `/ (root)`, then save.

## Rebuild the question data

The generated `question-bank.js` is ready to deploy. To regenerate it from the four source PDFs placed in `tmp/pdfs/shtemaran/`, run:

```sh
node scripts/build-question-bank.mjs
```

To regenerate `official-exams.js` and the diagram page images from the official exam and key PDFs placed in `tmp/pdfs/atc/`, run:

```sh
node scripts/build-atc-exams.mjs
```

The official importer validates all four answer columns in each final key, including the four “accept every marked answer” corrections published for the January 2025 tests.

To regenerate `voluntary-attestation.js` and its local page images from the 2022–2024 teacher-attestation PDFs placed in `tmp/pdfs/teacher-attestation/`, run:

```sh
node scripts/build-voluntary-attestation.mjs
```

The voluntary-attestation importer validates that every published variant has official answers for all 60 tasks.
