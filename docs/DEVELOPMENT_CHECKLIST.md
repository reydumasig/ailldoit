# Development Checklist

This document outlines the required checks and validations before making significant changes to our codebase. Always review this checklist before implementing major features or making structural changes.

## Documentation Rules

### Location and Structure
1. **Root Documentation**
   - `README.md`: Main project documentation
   - `CONTRIBUTING.md`: Contribution guidelines
   - `CHANGELOG.md`: Version history and changes
   - `LICENSE`: Project license

2. **Documentation Directory (`/docs`)**
   - Technical specifications
   - Architecture decisions
   - API documentation
   - Database schemas
   - Style guides

### Documentation Standards
1. **File Naming**
   - Use UPPERCASE for root-level documentation
   - Use kebab-case for specific documentation files
   - Always end with `.md` extension

2. **Content Structure**
   - Start with a clear title and description
   - Use proper markdown headings (h1 -> h6)
   - Include table of contents for long documents
   - Add last updated date

3. **Documentation Types**
   - Technical: Architecture, APIs, Database
   - Process: Workflows, Guidelines
   - User: Features, Usage
   - Development: Setup, Contributing

4. **Update Requirements**
   - Update docs before implementing changes
   - Keep changelogs current
   - Review documentation in PRs
   - Version documentation with major changes

## Making Changes

When making changes to the database schema:

1. **Document First**: Update this document with your proposed changes
2. **Review Impact**: Check all affected tables and relationships
3. **Migration Strategy**: Plan how to handle existing data
4. **Security Check**: Ensure RLS policies are updated
5. **Test**: Verify all cascade behaviors work as expected
6. **UI Impact Assessment**: Identify all UI components affected by the schema change

## Validation Checklist

Before implementing features that affect the database:

- [ ] Does it follow our naming conventions?
- [ ] Are appropriate indexes in place?
- [ ] Are RLS policies adequate?
- [ ] Are cascade rules appropriate?
- [ ] Is enum usage consistent?
- [ ] Are constraints properly defined?
- [ ] Is documentation updated?

## UI and Component Consistency Checks

Before implementing UI changes:

- [ ] **Component Search**: Have you searched the codebase for existing components that serve a similar purpose?
  - **Search Methods**:
    - Use grep/search tools with multiple search terms (e.g., `Button`, `Btn`, `ActionButton`)
    - Check our component directory at `/src/components/`
    - Review the design system documentation at `/docs/design-system.md`
    - Consult the component catalog in Storybook
  - **Similarity Checks**:
    - Components with similar visual appearance
    - Components with similar functionality/behavior
    - Components handling similar data structures
    - Components with similar naming patterns
  - **Common Duplications to Watch For**:
    - Modal/Dialog components
    - Button variants
    - Form input elements
    - Card/Container components
    - List/Table views
    - Navigation elements
  - **Questions to Ask**:
    - "Could an existing component be extended rather than creating a new one?"
    - "Could I add a prop to an existing component rather than creating a variant?"
    - "Is this truly a new pattern or am I recreating something?"
- [ ] **UI Library Check**: Does this match our existing UI library components?
- [ ] **Naming Consistency**: Are you using consistent naming with our existing components?
- [ ] **Props Structure**: Does the component follow our standard props structure pattern?
- [ ] **State Management**: Is state handled consistently with our patterns?
- [ ] **Event Handlers**: Do event handler names follow our conventions?
- [ ] **Style Consistency**: Are you using our design tokens/theme variables?
- [ ] **Responsive Behavior**: Does it follow our responsive design patterns?
- [ ] **Accessibility**: Does it maintain our accessibility standards?
- [ ] **Component Documentation**: Is the new/modified component documented in our component library?

## Code Review Additional Points

- [ ] Check for duplicate functionality in the PR vs. existing codebase
- [ ] Verify component imports are from our standard libraries
- [ ] Ensure consistent error handling patterns
- [ ] Confirm data fetching patterns match our standards

## Usage

This checklist should be reviewed:
1. Before starting work on any major feature
2. When making changes to the database schema
3. When creating new UI components
4. During code review of significant changes
5. When refactoring existing functionality

Remember: Prevention is better than cure. Taking the time to check these points before implementation can save significant refactoring effort later. 