import { describe, it, expect } from 'vitest';
import { parseMarkdownToQuestGraph } from './markdownQuestParser';

describe('MarkdownQuestParser - Section & Outline Parsing', () => {
  it('should parse the Full-Stack Web Architect preset into 6 nodes and 5 edges', () => {
    const markdown = `# Full-Stack Web Architect Roadmap

## HTML, CSS & Semantic Foundations
- Region: Frontend Archipelago
- XP: 100
- Tags: frontend, html, css
Semantic HTML5, CSS Grid, Flexbox, responsive layouts, and accessibility fundamentals.

## Modern TypeScript & JavaScript Core
- Region: Frontend Archipelago
- Prerequisites: HTML, CSS & Semantic Foundations
- XP: 150
- Tags: typescript, js, language
Strict type checking, generics, closures, event loop, and asynchronous programming with Promises.

## React 19 & Component Architecture
- Region: Frontend Archipelago
- Prerequisites: Modern TypeScript & JavaScript Core
- XP: 200
- Tags: react, ui, state
Server Components, Suspense, custom hooks, atomic design principles, and performant virtual DOM rendering.

## High-Performance Node.js & REST APIs
- Region: Backend Citadel
- Prerequisites: Modern TypeScript & JavaScript Core
- XP: 180
- Tags: node, api, express
Event-driven server architecture, streaming, rate limiting, and RESTful API endpoints.

## Distributed SQL & High-Availability Databases
- Region: Backend Citadel
- Prerequisites: High-Performance Node.js & REST APIs
- XP: 220
- Tags: database, postgresql, distributed
ACID transactions, query optimization, indexing strategies, and connection pooling.

## Cloud Native CI/CD & Edge Deployment
- Region: Backend Citadel
- Prerequisites: React 19 & Component Architecture, Distributed SQL & High-Availability Databases
- XP: 300
- Tags: devops, docker, edge
Containerization with Docker, GitHub Actions automation, and edge deployment on Cloudflare Workers.
`;

    const result = parseMarkdownToQuestGraph(markdown);

    expect(result.nodes.length).toBe(6);
    expect(result.edges.length).toBe(6); // Node 6 has 2 prerequisites, so 1+1+1+1+2 = 6 edges!
    expect(result.regions).toContain('Frontend Archipelago');
    expect(result.regions).toContain('Backend Citadel');
    expect(result.warnings.length).toBe(0);

    // Verify root task is UNLOCKED
    const rootTask = result.nodes.find((n) => n.title.includes('HTML, CSS'));
    expect(rootTask?.status).toBe('UNLOCKED');
    expect(rootTask?.prerequisites.length).toBe(0);

    // Verify child task is LOCKED with prerequisite
    const tsTask = result.nodes.find((n) => n.title.includes('TypeScript'));
    expect(tsTask?.status).toBe('LOCKED');
    expect(tsTask?.prerequisites).toContain(rootTask?.id);
  });

  it('should parse hierarchical bullet outlines with nested indentation', () => {
    const markdown = `# AI & Neural Sanctuary
- [x] Python Fundamentals (XP: 100) [tags: python]
  - [ ] PyTorch Tensors (XP: 150)
    - [ ] Attention Mechanisms (XP: 200)
`;

    const result = parseMarkdownToQuestGraph(markdown);
    expect(result.nodes.length).toBe(3);
    expect(result.nodes[0].status).toBe('COMPLETED');
    expect(result.nodes[1].prerequisites).toContain(result.nodes[0].id);
    expect(result.nodes[2].prerequisites).toContain(result.nodes[1].id);
    expect(result.edges.length).toBe(2);
  });
});
