/**
 * Global Three.js Texture Cache
 * Converts preloaded browser images to Three.js textures
 * Prevents white flash on Netlify by bridging browser cache and Three.js
 */

import * as THREE from "three";

class TextureCache {
  private cache = new Map<string, THREE.Texture>();
  private loadingPromises = new Map<string, Promise<THREE.Texture>>();

  /**
   * Get texture from cache or create from preloaded image
   * Returns immediately if texture is cached (no network request)
   */
  async getTexture(imagePath: string): Promise<THREE.Texture> {
    // Return cached texture if available
    if (this.cache.has(imagePath)) {
      return this.cache.get(imagePath)!;
    }

    // Return existing loading promise if in progress
    if (this.loadingPromises.has(imagePath)) {
      return this.loadingPromises.get(imagePath)!;
    }

    // Create new loading promise
    const loadPromise = this.loadTexture(imagePath);
    this.loadingPromises.set(imagePath, loadPromise);

    try {
      const texture = await loadPromise;
      this.cache.set(imagePath, texture);
      this.loadingPromises.delete(imagePath);
      return texture;
    } catch (error) {
      this.loadingPromises.delete(imagePath);
      throw error;
    }
  }

  /**
   * Load texture using browser-cached image (not TextureLoader)
   * This ensures we use the preloaded image from browser cache
   */
  private async loadTexture(imagePath: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const texture = new THREE.Texture(img);
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          resolve(texture);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = (error) => {
        console.error(error);
        reject(new Error(`Failed to load texture: ${imagePath}`));
      };

      // This will use browser cache if image was preloaded
      img.src = imagePath;
    });
  }

  /**
   * Preload textures during initial app load
   * Call this after image preloading to prime the texture cache
   */
  async preloadTextures(imagePaths: string[]): Promise<void> {
    const promises = imagePaths.map((path) => this.getTexture(path));
    await Promise.all(promises);
  }

  /**
   * Clear the entire texture cache (for memory management)
   */
  clear(): void {
    // Dispose all textures
    this.cache.forEach((texture) => {
      texture.dispose();
    });
    this.cache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }
}

// Global singleton instance
export const textureCache = new TextureCache();
