/**
 * Static Site Generator Engine Data Contract
 * Defines the complete data surface exposed to Eleventy templates and layouts in theme/.
 */

/**
 * Common atomic asset definitions
 */
export type Path = string;
export type URI = string;
export type Asset = Path | URI;

export interface ThemedAssetObject {
  light: Asset;
  dark: Asset;
}

export type ThemedAsset = Asset | ThemedAssetObject;

/** Either an asset reference or a simple-icon slug such as "github". */
export type Icon = ThemedAsset;

export type EmploymentType =
  | 'full-time'
  | 'part-time'
  | 'contract'
  | 'freelance'
  | 'internship'
  | 'volunteer';

export type DegreeType =
  | 'bachelor'
  | 'master'
  | 'doctorate'
  | 'associate'
  | 'bootcamp'
  | 'certificate';

export type Modality = 'in-person' | 'hybrid' | 'remote';

export type CollectionType = 'blog' | 'project' | 'publication' | 'certificate' | 'award';

export type ContentRef = `${CollectionType}:${string}`;

/** Dates are authored as YYYY, YYYY-MM or YYYY-MM-DD. Bare years arrive as integers from YAML. */
export type DateValue = string | number;
export type DateOrPresent = DateValue | 'present';

/**
 * Site entity (data.yaml -> site)
 */
export interface SiteData {
  url: string;
  title: string;
  description: string;
  /** Always present; defaults to "en" when not authored. */
  lang: string;
  locale?: string;
  favicon?: ThemedAsset;
  share_image?: ThemedAsset;
}

/**
 * Profile social link
 */
export interface SocialLink {
  label: string;
  url: string;
  icon?: Icon;
}

/**
 * Experience record (data.yaml -> profile.experience)
 */
export interface ExperienceItem {
  title: string;
  organization: string;
  start: DateValue;
  end: DateOrPresent;
  logo?: ThemedAsset;
  url?: string;
  type?: EmploymentType;
  location?: string;
  modality?: Modality;
  description?: string;
  skills?: string[];
}

/**
 * Education record (data.yaml -> profile.education)
 */
export interface EducationItem {
  title: string;
  organization: string;
  start: DateValue;
  end: DateOrPresent;
  logo?: ThemedAsset;
  url?: string;
  type?: DegreeType;
  grade?: string;
  location?: string;
  modality?: Modality;
  description?: string;
  skills?: string[];
}

/**
 * Elapsed span of a profile entry, with 'present' measured to the build date.
 */
export interface Duration {
  months: number;
  years: number;
  remainingMonths: number;
  /** Human readable span, e.g. "3 yrs 2 mos". */
  text: string;
}

/**
 * Presentation fields the engine adds to every experience and education record,
 * mirroring what collection items carry.
 */
export interface ProfileEntryPresentation {
  startDisplay: string;
  endDisplay: string;
  dateDisplay: string;
  startIso: string;
  endIso: string;
  isOngoing: boolean;
  duration: Duration | null;
}

/**
 * Profile entity (data.yaml -> profile)
 */
export interface ProfileData {
  name: string;
  handle: string;
  role: string;
  avatar?: ThemedAsset;
  location?: string;
  summary?: string;
  resume?: Asset;
  social?: SocialLink[];
  experience?: Array<ExperienceItem & ProfileEntryPresentation>;
  education?: Array<EducationItem & ProfileEntryPresentation>;
}

/**
 * Structured Table of Contents heading entry.
 * Slugs always match a heading anchor present in the rendered `html`.
 */
export interface TableOfContentsItem {
  id: string;
  slug: string;
  text: string;
  level: 2 | 3;
}

/**
 * Adjacent chronological navigation pointer (newer / older)
 */
export interface AdjacentNavigationPointer {
  title: string;
  permalink: string;
  slug: string;
  collection: CollectionType;
  date: string;
  dateDisplay: string;
  image: ThemedAsset | null;
}

/**
 * Content graph related item recommendation.
 * `reason` distinguishes a shared-skill match from a same-collection fallback.
 */
export interface RelatedItem {
  collection: CollectionType;
  title: string;
  slug: string;
  permalink: string;
  date: string;
  end: string;
  isOngoing: boolean;
  image: ThemedAsset | null;
  logo: ThemedAsset | null;
  description: string;
  sharedSkills: string[];
  reason: 'skills' | 'collection';
}

/**
 * Precomputed SEO & OpenGraph metadata
 */
export interface SeoMetadata {
  canonicalUrl: string;
  title: string;
  siteTitle: string;
  description: string;
  image: string;
  ogType: 'article' | 'website';
  publishedTime: string | null;
  modifiedTime: string | null;
  publishedIso: string | null;
}

/**
 * Base properties guaranteed on all synthesized collection items
 */
export interface BaseCollectionItem {
  slug: string;
  title: string;
  collection: CollectionType;
  permalink: string;
  skills: string[];
  hasMarkdown: boolean;
  isMarkdown: boolean;
  content: string | null;
  html: string;
  excerpt: string;
  /** The `publisher` of a publication or the `issuer` of a certificate or award, otherwise empty. */
  subtitle: string;
  wordCount: number;
  readingTime: number;
  toc: TableOfContentsItem[];
  /** The date the item is ranked and displayed by: `date` for most types, `start` for projects. */
  primaryDate: string;
  dateDisplay: string;
  dateIso: string;
  /** Four-digit year of the primary date, for grouping archives by year. */
  year: number | null;
  /** True when the entry is still running (`end: present`). Ongoing entries rank first. */
  isOngoing: boolean;
  newer: AdjacentNavigationPointer | null;
  older: AdjacentNavigationPointer | null;
  related: RelatedItem[];
  seo: SeoMetadata;
  filePath: string | null;
  baseDir: string;
  /** External link declared by the author, distinct from the internal `permalink`. */
  url?: string;
  description?: string;
  image?: ThemedAsset;
  logo?: ThemedAsset;
}

export interface BlogItem extends BaseCollectionItem {
  collection: 'blog';
  date: DateValue;
}

export interface ProjectItem extends BaseCollectionItem {
  collection: 'project';
  start: DateValue;
  end?: DateOrPresent;
  startDisplay: string;
  endDisplay?: string;
  repository?: string;
}

export interface PublicationItem extends BaseCollectionItem {
  collection: 'publication';
  publisher: string;
  date: DateValue;
  authors?: string[];
}

export interface CertificateItem extends BaseCollectionItem {
  collection: 'certificate';
  issuer: string;
  date: DateValue;
  expires?: DateValue;
  /** Both present only when `expires` is set. `isExpired` is evaluated against the build date. */
  expiresDisplay?: string;
  isExpired?: boolean;
  credential_id?: string;
}

export interface AwardItem extends BaseCollectionItem {
  collection: 'award';
  issuer: string;
  date: DateValue;
}

export type CollectionItem =
  | BlogItem
  | ProjectItem
  | PublicationItem
  | CertificateItem
  | AwardItem;

export interface CollectionsData {
  blog: BlogItem[];
  project: ProjectItem[];
  publication: PublicationItem[];
  certificate: CertificateItem[];
  award: AwardItem[];
}

/** A pinned item is a collection item tagged with the reference that selected it. */
export type PinnedItem = CollectionItem & { _ref: ContentRef };

/**
 * Skills inverted taxonomy index
 */
export interface TaxonomyReference {
  type: CollectionType | 'experience' | 'education';
  title: string;
  /** Internal link: a collection permalink, or an on-page anchor for profile entries. */
  permalink: string;
  /** External link declared by the author, empty when none. */
  url: string;
  slug: string;
  organization?: string;
  date?: string;
  end?: string;
  /** The entry's mark, so a reference renders like any listing row. */
  logo: ThemedAsset | null;
}

export interface SkillTaxonomyEntry {
  /** Display name, using the casing first encountered in content. */
  name: string;
  /** Canonical lookup key: the lowercased name. */
  key: string;
  /** URL-safe, collision-free slug for routing. */
  slug: string;
  count: number;
  items: TaxonomyReference[];
}

export interface TaxonomyData {
  /** Entries keyed by canonical key (lowercased skill name). References are ordered newest first. */
  skills: Record<string, SkillTaxonomyEntry>;
  /** All entries, ordered by frequency then name. */
  allSkills: SkillTaxonomyEntry[];
  skillNames: string[];
  totalUniqueSkills: number;
}

/**
 * Unified Search Index
 */
export interface SearchRecord {
  id: string;
  type: string;
  typeLabel: string;
  slug?: string;
  title: string;
  subtitle: string;
  url: string;
  permalink: string;
  date?: DateValue;
  dateDisplay: string;
  skills: string[];
  description: string;
  content: string;
  hasMarkdown?: boolean;
  meta?: Record<string, unknown>;
}

export interface SearchIndex {
  version: string;
  generatedAt: string;
  totalRecords: number;
  records: SearchRecord[];
}

/**
 * Registry describing every collection type, so a theme can build navigation and
 * section listings generically instead of hard-coding collection names.
 */
export interface CollectionTypeInfo {
  name: CollectionType;
  label: string;
  labelPlural: string;
  /** Index route for the collection, e.g. "/blog/". */
  permalink: string;
  count: number;
  hasItems: boolean;
}

/**
 * Aggregated content statistics
 */
export interface CollectionStats {
  total: number;
  markdown: number;
  inline: number;
  words: number;
}

export interface ContentStats {
  collections: Record<CollectionType, CollectionStats>;
  totalItems: number;
  totalWords: number;
  totalSkills: number;
}

/**
 * Metadata describing the current compilation
 */
export interface BuildInfo {
  version: string;
  generatedAt: string;
  generatedYear: number;
  locale: string;
  contentDir: string;
}

/**
 * UI presentation mappings dictionary
 */
export interface UiMappings {
  modality: {
    experience: Record<Modality, string>;
    education: Record<Modality, string>;
    default: Record<Modality, string>;
  };
  employmentType: Record<EmploymentType, string>;
  degreeType: Record<DegreeType, string>;
  collections: {
    singular: Record<CollectionType, string>;
    plural: Record<CollectionType, string>;
  };
}

/**
 * Parsed content.yaml, exposed as `content_data` because Eleventy reserves `content`.
 */
export interface ContentDeclarations {
  pinned_content?: ContentRef[];
  blog?: Array<{ slug: string; [key: string]: unknown }>;
  project?: Array<{ slug: string; [key: string]: unknown }>;
  publication?: Array<{ slug: string; [key: string]: unknown }>;
  certificate?: Array<{ slug: string; [key: string]: unknown }>;
  award?: Array<{ slug: string; [key: string]: unknown }>;
}

/**
 * Complete Global Data Surface exposed to Eleventy Templates.
 *
 * Eleventy reserves `content` and `collections`, so the engine publishes the parsed
 * content.yaml as `content_data` and the synthesized map as `collections_data`.
 * The five collections are additionally registered as native Eleventy collections,
 * alongside `all_content` and `pinned`.
 */
export interface EngineData {
  site: SiteData;
  profile: ProfileData;
  content_data: ContentDeclarations;
  collections_data: CollectionsData;
  collection_types: CollectionTypeInfo[];
  /** Every collection item in one recency-ordered list, for combined feeds. */
  all_content: CollectionItem[];
  pinned_items: PinnedItem[];
  taxonomy: TaxonomyData;
  stats: ContentStats;
  mappings: UiMappings;
  search_index: SearchIndex;
  build: BuildInfo;
  contentDir: string;
}
