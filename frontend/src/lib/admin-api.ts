import { createClient } from './supabase/client';

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
  }
}

/**
 * Base wrapper for calling the backend Admin API.
 * Automatically handles getting the Supabase JWT token and appending it to headers.
 */
class AdminApi {
  private baseUrl: string;

  constructor() {
    // Determine backend URL based on environment
    // Use NEXT_PUBLIC_API_URL if defined, otherwise fallback to localhost
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  }

  /**
   * Retrieves the current Supabase session token
   */
  private async getToken(): Promise<string | null> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  /**
   * Generates headers for the fetch request, including Authorization
   */
  private async getHeaders(isFormData = false): Promise<Headers> {
    const headers = new Headers();
    const token = await this.getToken();
    
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // Don't set Content-Type for FormData, browser will set it with boundary
    if (!isFormData) {
      headers.set('Content-Type', 'application/json');
    }

    return headers;
  }

  /**
   * Core fetch handler with error checking
   */
  private async request<T>(endpoint: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/api/admin${endpoint}`;
    
    const response = await fetch(url, options);

    if (!response.ok) {
      // If 401 Unauthorized, Supabase token might be expired.
      // Next.js middleware handles redirect on full page reload,
      // but for client side fetches we might want to trigger a redirect
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          window.location.href = '/admin/login';
        }
      }

      let errorMsg = response.statusText;
      try {
        const errorData = await response.json();
        errorMsg = errorData.detail || errorMsg;
      } catch (e) {
        // Not JSON
      }
      throw new AdminApiError(response.status, errorMsg);
    }

    // Some endpoints might return 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // --- HTTP Methods ---

  async get<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'GET',
      headers,
    });
  }

  async post<T>(endpoint: string, body?: any): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body: any): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'DELETE',
      headers,
    });
  }

  async patch<T>(endpoint: string, body?: any): Promise<T> {
    const headers = await this.getHeaders();
    return this.request<T>(endpoint, {
      method: 'PATCH',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Special handler for uploading files via FormData (POST)
   */
  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const headers = await this.getHeaders(true);
    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });
  }

  /**
   * Upload via PUT (for updates like location edit, background, mascot)
   */
  async uploadPut<T>(endpoint: string, formData: FormData): Promise<T> {
    const headers = await this.getHeaders(true);
    return this.request<T>(endpoint, {
      method: 'PUT',
      headers,
      body: formData,
    });
  }
}

export const adminApi = new AdminApi();
