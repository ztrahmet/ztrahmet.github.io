# Content Guide

All site content lives in an isolated directory (by default `content/`). It consists strictly of data—YAML files, Markdown documents, and media assets. It contains no presentation logic, no templates, and no styling.

```
content/
├── data.yaml              # Site configuration, personal profile, experience, education
├── content.yaml           # Collection declarations and pinned items
├── blog/                  # Blog articles (markdown entries or inline)
├── project/               # Project showcases
├── publication/           # Academic papers, articles, and book chapters
├── certificate/           # Certifications and credentials
├── award/                 # Honors and recognitions
└── images/                # Shared static assets (published at matching site root paths)
```

Both YAML files support live in-editor validation via JSON Schema:

```yaml
# yaml-language-server: $schema=../engine/schemas/data.schema.json
# (or in content.yaml)
# yaml-language-server: $schema=../engine/schemas/content.schema.json
```

---

## 1. Setting Up Your Own Content Repository

The engine decouples content from the codebase. You can keep your content in the same repository or host it in a dedicated private repository (e.g., `username/site-content`).

### Local Development

Point the engine commands to your custom content folder via `--content`:

```bash
npm run dev -- --content ../site-content
npm run build -- --content ../site-content
npm run validate -- --content ../site-content
```

### Private Repository & Automated CI Deployment

To keep your personal notes and private drafts in a private GitHub repository while deploying to GitHub Pages:

1. **Content Repository (`username/site-content`):**
   Add a GitHub Action workflow (e.g., `.github/workflows/dispatch.yml`) that triggers on push to `main` and dispatches a rebuild to your public engine repository:
   ```yaml
   name: Dispatch Deploy
   on:
     push:
       branches: [main]
   jobs:
     dispatch:
       runs-on: ubuntu-latest
       steps:
         - name: Trigger GitHub Pages Rebuild
           run: |
             curl -X POST \
               -H "Accept: application/vnd.github.v3+json" \
               -H "Authorization: token ${{ secrets.SITE_DISPATCH_TOKEN }}" \
               https://api.github.com/repos/<username>/<username>.github.io/dispatches \
               -d '{"event_type":"content-updated"}'
   ```
   Add a `SITE_DISPATCH_TOKEN` secret to your content repository (a Personal Access Token with `Contents: Read and write` on the engine repository).

2. **Engine Repository (`username/username.github.io`):**
   Configure your deploy workflow to listen for `repository_dispatch` and clone your content repository during the build step using a deploy key or PAT, then run `npm run build -- --content ./path-to-content`.

---

## 2. `data.yaml` Structure

`data.yaml` defines global site settings and your professional profile.

```yaml
site:
  url: https://username.github.io      # Canonical site root URL (required)
  title: Portfolio                     # Base site title (required)
  description: Software engineer work. # Meta description (required)
  lang: en                             # HTML lang attribute (default: en)
  locale: en_US                        # OpenGraph locale (default: en_US)
  accent: petrol                       # Theme accent: petrol, amber, blue, green, red, purple
  favicon: /images/favicon.svg         # Site favicon
  share_image: /images/share.png       # Default social share card (1200x630 recommended)

profile:
  name: Name Surname                   # Full name (required)
  handle: username                     # Short identifier / username (required)
  role: Software Engineer              # Primary title or headline (required)
  avatar: /images/avatar.svg           # Profile picture (path or { light, dark })
  location: San Francisco, CA
  summary: >-
    Short executive summary. Displayed on the CV and used in metadata.

  skills:                              # Declared top-level skills highlighted on CV
    - Distributed Systems
    - Go
    - TypeScript

  languages:
    - name: English
      level: native                    # native, or CEFR levels: A1, A2, B1, B2, C1, C2
    - name: German
      level: B2

  resume: /documents/resume.pdf        # Optional. See Resume section below.

  social:
    - label: GitHub
      url: https://github.com/username
    - label: LinkedIn
      url: https://linkedin.com/in/username
    - label: Email
      url: mailto:you@example.com

  experience:
    - title: Staff Software Engineer   # required
      organization: Example Corp       # required
      start: 2022-01                   # required (YYYY or YYYY-MM)
      end: present                     # required (YYYY, YYYY-MM, or 'present')
      type: full-time                  # full-time, part-time, contract, freelance, internship, volunteer
      modality: hybrid                 # in-person, hybrid, remote
      location: San Francisco, CA
      url: https://example.com
      logo: /images/logos/example.svg  # Organization logo
      description: What you accomplished in this role.
      skills: [Go, Kubernetes, Cloud]

  education:
    - title: B.Sc. Computer Engineering # required
      organization: University of Tech # required
      start: 2018-09                   # required
      end: 2022-06                     # required
      type: bachelor                   # bachelor, master, doctorate, associate, bootcamp, certificate
      grade: 3.8 GPA                   # Optional GPA or honors
      skills: [Algorithms, C++, Linux]
```

### Social Links & Domain Inference
For items in `profile.social`, the `icon` property is optional. The engine automatically infers standard symbolic icons for common domains:
- `github.com` → `github`
- `linkedin.com` → `linkedin`
- `orcid.org` → `orcid`
- `twitter.com` / `x.com` → `x`
- `mastodon.social` / `fosstodon.org` → `mastodon`
- `mailto:` → `mail`

You can explicitly specify any named icon slug (e.g., `icon: discord`) or path to a custom SVG.

### Resume & CV Actions
`profile.resume` is optional:
- **Configured:** The CV page renders a **Download PDF** button linking directly to the PDF file with the `download` attribute.
- **Unset:** The CV page renders a **Print** button triggering the browser's print dialog, where visitors can save the page as a formatted PDF.

---

## 3. `content.yaml` & Collections

`content.yaml` declares what belongs to each of the 5 collections (`blog`, `project`, `publication`, `certificate`, `award`) and defines curated pins:

```yaml
pinned_content:
  - blog:how-to-sign-commits
  - project:open-source-engine
  - publication:cache-oblivious-trees

blog:
  - slug: how-to-sign-commits          # Markdown-driven: details in blog/how-to-sign-commits/index.md
  - slug: why-static-wins              # Inline entry: details defined right here
    title: Why Static Site Generators Win
    date: 2024-03-01
    description: Analysis of static compilation vs runtime SSR.
    skills: [Architecture, Performance]

project:
  - slug: open-source-engine

publication:
  - slug: cache-oblivious-trees

certificate:
  - slug: aws-solutions-architect
    title: AWS Certified Solutions Architect
    issuer: Amazon Web Services
    date: 2024-05
    link:
      - label: Verify
        url: https://aws.amazon.com/verification/...
    logo: /images/logos/aws.svg
    skills: [AWS, Cloud Architecture]

award:
  - slug: honor-graduate
    title: Second Ranked Graduate
    issuer: Engineering Faculty
    date: 2022-06
```

### Markdown-Driven vs Inline Entries
1. **Markdown-Driven:** Best for long-form content (blog posts, extensive project showcases). Specify only `slug` in `content.yaml`, and create `content/<collection>/<slug>/index.md`. Metadata is defined in the Markdown frontmatter.
2. **Inline:** Best for short credentials (certificates, awards) with no body text. Declare the fields directly under the collection in `content.yaml`.

*Note: Frontmatter always takes precedence if a Markdown file is present.*

### The Unified `link` Field
All collection entries use the unified `link` array (matching `profile.social`):

```yaml
link:
  - label: Repository
    url: https://github.com/username/project
  - label: Live Demo
    url: https://demo.example.com
    icon: external # Optional icon slug or SVG path
```

When `icon` is omitted, domain inference automatically detects standard icons (e.g., GitHub, ORCID).

### Collection Requirements Matrix

| Collection | Required Fields | Optional Fields |
|---|---|---|
| `blog` | `slug`, `title`, `date` | `link`, `image`, `logo`, `description`, `skills` |
| `project` | `slug`, `title`, `start` | `end`, `link`, `image`, `logo`, `description`, `skills` |
| `publication` | `slug`, `title`, `publisher`, `date` | `link`, `image`, `logo`, `authors`, `description`, `skills` |
| `certificate` | `slug`, `title`, `issuer`, `date` | `expires`, `credential_id`, `link`, `image`, `logo`, `skills` |
| `award` | `slug`, `title`, `issuer`, `date` | `link`, `image`, `logo`, `description`, `skills` |

---

## 4. Assets: Logos vs Icons

### Path Resolution
- **Root-Relative (`/images/...`):** Resolves against the content root directory (`content/images/...`).
- **Co-Located (`./image.png`):** Resolves relative to the referencing entry folder (`content/blog/my-post/image.png`).
- Any non-collection folder inside `content/` (such as `content/images/` or `content/documents/`) is automatically published at a matching URL path (`/images/...`, `/documents/...`).

### Logos vs Icons
- **`icon` (Symbolic):** Monochromatic vector icons. Always rendered in `currentColor` so they adapt automatically to light and dark theme modes. External SVG URLs use CSS mask rendering to inherit the theme ink color.
- **`logo` (Brand Authentic):** Brand and organization marks. Retain their authentic brand colors, gradients, and original fills. Embedded SVGs automatically have their IDs namespaced by the engine to prevent gradient collisions.
- **Themed Assets:** Any asset (avatar, logo, image) can be provided as a light/dark variant:
  ```yaml
  logo:
    light: /images/logos/brand-light.svg
    dark: /images/logos/brand-dark.svg
  ```

---

## 5. Skills & Taxonomy

Skills are declared as freeform strings on profile experience, education, and collection items.
- Skills are indexed across the site, populating the skills taxonomy and generating individual `/skills/<slug>/` hub pages.
- Grouping is case-insensitive (`Node.js` and `node.js` resolve to the same skill using the first encountered capitalization).
- Unique skill sets automatically compute "Related Content" recommendations across all collections.

---

## 6. Validation & Troubleshooting

The engine verifies all content using JSON Schema before building. Run:

```bash
npm run validate
```

Validation guarantees:
- All required fields exist and conform to types.
- No unrecognized fields are passed (`additionalProperties: false`).
- Slugs are unique within each collection.
- Closed vocabularies (`employment type`, `education type`, `modality`, `accent`) are strictly adhered to.
