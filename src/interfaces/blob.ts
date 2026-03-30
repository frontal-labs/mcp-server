export interface UploadOptions {
  bucket: string;
  key: string;
  content: string;
  contentType?: string;
}

export interface ListOptions {
  bucket: string;
  prefix?: string;
  maxKeys?: number;
}

export interface BlobObject {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
}

export interface ListResponse {
  objects: BlobObject[];
  truncated: boolean;
}

export interface UploadResponse {
  bucket: string;
  key: string;
  url: string;
  size: number;
  contentType: string;
  etag: string;
}
