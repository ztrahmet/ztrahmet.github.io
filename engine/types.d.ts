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
export type Icon = string | ThemedAsset;

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

/**
 * Site entity (data.yaml -> site)
 */
export interface SiteData {
  title: string;
  description: string;
  url: string;
  language?: string;
  favicon?: ThemedAsset;
  share_image?: ThemedAsset;
  copyright?: string;
}

/**
 * Profile social link
 */
export interface SocialLink {
  name: string;
  url: string;
  icon?: Icon;
}

/**
 * Experience record (data.yaml -> profile.experience)
 */
export interface ExperienceItem {
  title: string;
  organization: string;
  location?: string;
  modality?: Modality;
  type?: EmploymentType;
  start: string | number;
  end?: string | number | 'present' | 'Present';
  description?: string;
  skills?: string[];
  logo?: ThemedAsset;
  url?: string;
}

/**
 * Education record (data.yaml -> profile.education)
 */
export interface EducationItem {
  title: string;
  organization: string;
  location?: string;
  modality?: Modality;
  type?: DegreeType;
  start: string | number;
  end?: string | number | 'present' | 'Present';
  grade?: string;
  description?: string;
  skills?: string[];
  logo?: ThemedAsset;
  url?: string;
}

/**
 * Profile entity (data.yaml -> profile)
 */
export interface ProfileData {
  name: string;
  handle: string;
  role: string;
  headline?: string;
  bio?: string;
  avatar?: ThemedAsset;
  resume?: Asset;
  social?: SocialLink[];
  experience?: ExperienceItem[];
  education?: EducationItem[];
}

/**
 * Structured Table of Contents heading entry
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
  date: string | number;
  dateDisplay: string;
}

/**
 * Content graph related item recommendation
 */
export interface RelatedItem {
  collection: CollectionType;
  title: string;
  slug: string;
  permalink: string;
  date: string | number;
  image?: ThemedAsset | null;
  description?: string;
  sharedSkills: string[];
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
}

/**
 * Base properties guaranteed on all synthesized collection items
 */
export interface BaseCollectionItem {
  slug: string;
  title: string;
  collection: CollectionType;
  permalink: string;
  url: string;
  skills: string[];
  hasMarkdown: boolean;
  isMarkdown: boolean;
  content: string | null;
  html: string;
  excerpt: string;
  wordCount: number;
  readingTime: number;
  toc: TableOfContentsItem[];
  newer: AdjacentNavigationPointer | null;
  older: AdjacentNavigationPointer | null;
  related: RelatedItem[];
  seo: SeoMetadata;
  filePath: string | null;
  baseDir: string;
}

/**
 * Blog item
 */
export interface BlogItem extends BaseCollectionItem {
  collection: 'blog';
  date: string | number;
  description?: string;
  image?: ThemedAsset;
}

/**
 * Project item
 */
export interface ProjectItem extends BaseCollectionItem {
  collection: 'project';
  start: string | number;
  end?: string | number | 'present' | 'Present';
  description?: string;
  image?: ThemedAsset;
  repository?: string;
}

/**
 * Publication item
 */
export interface PublicationItem extends BaseCollectionItem {
  collection: 'publication';
  publisher: string;
  date: string | number;
  authors?: string[];
  description?: string;
  image?: ThemedAsset;
}

/**
 * Certificate item
 */
export interface CertificateItem extends BaseCollectionItem {
  collection: 'certificate';
  issuer: string;
  date: string | number;
  expires?: string | number;
  credential_id?: string;
  description?: string;
  image?: ThemedAsset;
}

/**
 * Award item
 */
export interface AwardItem extends BaseCollectionItem {
  collection: 'award';
  issuer: string;
  date: string | number;
  description?: string;
  image?: ThemedAsset;
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

/**
 * Skills inverted taxonomy index
 */
export interface SkillTaxonomyEntry {
  name: string;
  count: number;
  items: Array<{
    type: string;
    title: string;
    permalink: string;
    slug: string;
  }>;
}

export interface TaxonomyData {
  skills: Record<string, SkillTaxonomyEntry>;
  allSkills: string[];
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
  date?: string | number;
  dateDisplay: string;
  skills: string[];
  description: string;
  content: string;
  hasMarkdown?: boolean;
  meta?: Record<string, any>;
}

export interface SearchIndex {
  version: string;
  generatedAt: string;
  totalRecords: number;
  records: SearchRecord[];
}

/**
 * UI presentation mappings dictionary
 */
export interface UiMappings {
  modality: {
    experience: Record<string, string>;
    education: Record<string, string>;
    default: Record<string, string>;
  };
  employmentType: Record<string, string>;
  degreeType: Record<string, string>;
  collections: Record<string, { singular: string; plural: string }>;
}

/**
 * Complete Global Data Surface exposed to Eleventy Templates
 */
export interface EngineData {
  site: SiteData;
  profile: ProfileData;
  content: {
    pinned_content?: ContentRef[];
    blog?: Array<{ slug: string; [key: string]: any }>;
    project?: Array<{ slug: string; [key: string]: any }>;
    publication?: Array<{ slug: string; [key: string]: any }>;
    certificate?: Array<{ slug: string; [key: string]: any }>;
    award?: Array<{ slug: string; [key: string]: any }>;
  };
  content_data: EngineData['content'];
  site_content: EngineData['content'];
  collections_data: CollectionsData;
  pinned_items: CollectionItem[];
  taxonomy: TaxonomyData;
  mappings: UiMappings;
  search_index: SearchIndex;
  contentDir: string;
}
