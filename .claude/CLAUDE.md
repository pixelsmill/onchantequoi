# Chorale — notes projet

- Webapp privée de répétition (français, mobile d'abord, thème clair/sombre). Specs et prototype d'origine : `specs/` (ne pas modifier).
- Toujours garder le **mode démo** fonctionnel (`apiKey: 'REMPLACER'` dans `src/app/config.ts`, ou `?demo`) : il sert à montrer l'app sans backend.
- Données : `songs/{id}`, `files/{sha256}`, `keys/{clé}` (jamais lisibles côté client), `members/{uid}`. Les deux implémentations de `Backend` (`core/firebase-backend.ts`, `core/demo-backend.ts`) doivent rester équivalentes.
- Les `.mp4` audio de WhatsApp arrivent souvent en `video/mp4` : l'input fichier, le share target et `guessType` doivent continuer à les accepter.
- Node 22 (Volta). Tests : `npm test`, `npm run test:functions`, `npm run test:rules`, `npm run test:depot` (émulateurs : Java 21+, voir LISEZMOI.md).
- Textes de l'interface en français, avec espaces insécables dans « … ».


You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection
