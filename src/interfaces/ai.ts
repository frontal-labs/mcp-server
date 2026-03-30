export interface GenerateTextOptions {
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateImageOptions {
  prompt: string;
  size?: "256x256" | "512x512" | "1024x1024";
  quality?: "standard" | "hd";
}

export interface GenerateEmbeddingsOptions {
  text: string;
  model?: string;
}

export interface GenerateTextResponse {
  text: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface GenerateImageResponse {
  url: string;
  prompt: string;
  size: string;
  quality: string;
  created: string;
}

export interface GenerateEmbeddingsResponse {
  embedding: number[];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}
