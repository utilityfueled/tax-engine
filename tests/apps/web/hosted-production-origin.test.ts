import { describe, expect, it, vi } from 'vitest';
import { getAllowedOrigins } from '@/lib/cors';
import { getHostedAuthConfig } from '@/lib/hosted-auth';
import { getHostedBillingConfig } from '@/lib/hosted-billing';
import { resolveHostedAppBaseUrl } from '@/lib/hosted-runtime-safety';

vi.mock('@/lib/hosted-ai-availability', () => ({ canPurchaseHostedAiCredits: () => false }));

const hostedProduction = {
  NODE_ENV: 'production', TAX_ENGINE_DEPLOYMENT_MODE: 'hosted', TAX_ENGINE_BILLING_MODE: 'test',
  BETTER_AUTH_SECRET: 'synthetic-hosted-origin-test-auth-secret',
  DATABASE_URL: 'postgresql://localhost/app', STRIPE_SECRET_KEY: 'sk_test_synthetic',
  STRIPE_PRICE_ID_STARTER_MONTHLY: 'price_test_starter', STRIPE_PRICE_ID_PLUS_MONTHLY: 'price_test_plus',
  STRIPE_WEBHOOK_SECRET: 'whsec_synthetic',
};

describe('hosted production origin', () => {
  it.each([
    'http://tax.example', 'http://127.0.0.1:3109',
    'https://synthetic:secret@tax.example', 'https://tax.example/private',
    'https://tax.example/?', 'https://tax.example/#', 'https://tax.example/?private=secret',
    'https://tax.example/#secret', 'https://tax.example/a/..', 'https://@tax.example',
    'https:/tax.example', 'https://tax.example\\', 'https://tax.example\u0000',
  ])('rejects unsafe hosted origins across auth billing and CORS: %s', value => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const env = { ...hostedProduction, TAX_ENGINE_APP_URL: value };
      expect.soft(resolveHostedAppBaseUrl(env)).toMatchObject({ blocked: true, hasValidConfiguredUrl: false });
      expect.soft(getHostedAuthConfig(env)).toMatchObject({ blocked: true, trustedOrigins: [] });
      expect.soft(getHostedBillingConfig(env).blocked).toBe(true);
      expect.soft([...getAllowedOrigins(env)]).toEqual([]);
      expect.soft(JSON.stringify(output.mock.calls)).not.toContain(value);
    } finally {
      output.mockRestore();
    }
  });

  it.each(['https://tax.example', 'https://tax.example/', 'https://tax.example:8443'])('accepts the configured HTTPS origin: %s', value => {
    const env = { ...hostedProduction, TAX_ENGINE_APP_URL: value };
    expect(resolveHostedAppBaseUrl(env)).toEqual({ appBaseUrl: value, blocked: false, hasValidConfiguredUrl: true });
    expect(getHostedAuthConfig(env).blocked).toBe(false);
    expect(getHostedBillingConfig(env).blocked).toBe(false);
    expect([...getAllowedOrigins(env)]).toEqual([new URL(value).origin]);
  });

  it('does not expose the invalid configured value in development diagnostics', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const value = 'synthetic-private-malformed-configuration';
      const result = resolveHostedAppBaseUrl({ NODE_ENV: 'development', TAX_ENGINE_APP_URL: value });
      expect(result).toEqual({ appBaseUrl: 'http://localhost:3000', blocked: false, hasValidConfiguredUrl: false });
      expect(warn).toHaveBeenCalledOnce();
      expect(JSON.stringify(warn.mock.calls)).not.toContain(value);
    } finally {
      warn.mockRestore();
    }
  });

  it('validates supplemental hosted browser origins without logging rejected entries', () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const rejected = [
        'file:///synthetic-private', 'http://unsafe.example',
        'https://synthetic:secret@invalid.example', 'https://invalid.example/private',
        'synthetic-private-invalid-setting',
      ];
      const env = { ...hostedProduction, TAX_ENGINE_APP_URL: 'https://tax.example',
        BETTER_AUTH_TRUSTED_ORIGINS: [...rejected, 'https://other.tax.example/'].join(',') };
      const expected = ['https://tax.example', 'https://other.tax.example'];
      expect.soft(getHostedAuthConfig(env).trustedOrigins).toEqual(expected);
      expect.soft([...getAllowedOrigins(env)]).toEqual(expected);
      for (const value of rejected) expect.soft(JSON.stringify(output.mock.calls)).not.toContain(value);
      const preview = { ...env, VERCEL_ENV: 'preview', VERCEL_URL: 'one-preview.vercel.app' };
      const previewOrigins = ['https://one-preview.vercel.app', 'https://other.tax.example'];
      expect.soft(getHostedAuthConfig(preview).trustedOrigins).toEqual(previewOrigins);
      expect.soft([...getAllowedOrigins(preview)]).toEqual(previewOrigins);
    } finally {
      output.mockRestore();
    }
  });

  it('does not trust supplemental origins when the primary hosted origin is blocked', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const env = { ...hostedProduction, TAX_ENGINE_APP_URL: 'http://tax.example',
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://valid.tax.example' };
      expect.soft(getHostedAuthConfig(env)).toMatchObject({ blocked: true, trustedOrigins: [] });
      expect.soft([...getAllowedOrigins(env)]).toEqual([]);
      const preview = { ...env, VERCEL_ENV: 'preview', VERCEL_URL: 'https://invalid.vercel.app' };
      expect.soft(getHostedAuthConfig(preview)).toMatchObject({ blocked: true, trustedOrigins: [] });
      expect.soft([...getAllowedOrigins(preview)]).toEqual([]);
    } finally {
      output.mockRestore();
    }
  });
});
