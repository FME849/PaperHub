# Functional Requirements

## Authentication

### Register
Users can create account with email/OTP.

### Login
Users can login/logout.

---

## Topic Management

Users can:
- create topic
- update topic
- delete topic

Topic contains:
- name
- category code từ arXiv (cs.AI, hep-ex, i.e)
- keywords

---

## Paper Fetching

System fetches papers by category from arXiv every 3 hours.

Fetch fields:
- title
- abstract
- authors
- published date
- arxiv url
- category

---

## Topic subscription matching

System categorize papers by topic and send notification for users that follow the topic

Matching order:
1. Match by category
2. Keywords contain in title or abstract

---

## Summarization

System generates short summary from abstract.

Summary length:
- maximum 5 bullet points
