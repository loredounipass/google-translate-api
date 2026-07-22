import languages from "../lib/languages.json";

export const AVAILABLE_LANGUAGES = languages.data
export const DEFAULT_SOURCE_LANGUAGE = "en"
export const DEFAULT_TARGET_LANGUAGE = "es"

export const AI_MODELS = {
  "nvidia-llama": {
    id: "meta/llama-3.1-8b-instruct",
    name: "Llama 3.1 8B",
    provider: "Meta",
    free: true,
  },
  "nvidia-nemotron": {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    name: "Nemotron 3 Nano Omni",
    provider: "NVIDIA",
    free: true,
  },

  "nvidia-gpt-oss": {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    provider: "OpenAI",
    free: true,
  },

  "nvidia-mistral": {
    id: "mistralai/mistral-small-4-119b-2603",
    name: "Mistral Small 4 119B",
    provider: "Mistral AI",
    free: true,
  },
};

export const DEFAULT_MODEL = "nvidia-mistral";