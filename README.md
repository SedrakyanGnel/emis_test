# Կենսաբանության փորձնական թեստ

Static GitHub Pages application with two clearly separated biology collections: generated question-bank practice variants and real exams published by Armenia's Assessment and Testing Center (ԳԹԿ).

## Features

- 86 selectable question-bank practice variants
- 3,421 four-option questions from question-bank parts 1–4
- 408 numeric short-answer problems from question-bank part 4
- 20 real ԳԹԿ exam variants from 2024 and 2025, imported from 20 exam PDFs and 5 final answer keys
- Official exams preserve single-choice, matching, ordering, multiple-selection, numeric, and true/false tasks
- Diagram pages from the official Tavush papers are included as local images
- Question-bank tests contain 40 multiple-choice and 20 short-answer questions; official tests contain 70 numbered tasks and 80 separately scored responses
- Answer positions are shuffled independently whenever a test starts
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

Commit `index.html`, `styles.css`, `app.js`, `question-bank.js`, `official-exams.js`, `.nojekyll`, and `assets/`. In the repository settings, open **Pages**, choose **Deploy from a branch**, select the main branch and `/ (root)`, then save.

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
