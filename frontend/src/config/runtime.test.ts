/**
 * 单元测试：src/config/runtime.ts
 * ---------------------------------------------------------------------------
 * 运行时配置是「一份构建产物部署到多环境」的关键，配置归一化错误会直接导致
 * 接口地址拼接错误（如 //api、/api/api）或子路径部署白屏，故用测试锁死规则。
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_API_BASE_URL,
  applyRuntimeConfig,
  buildHealthUrl,
  normalizeApiBaseUrl,
  normalizeBasePath,
  readRawRuntimeConfig,
  resolveAppPath,
  routerBasename,
  runtimeConfig,
} from './runtime';

describe('normalizeApiBaseUrl（API 基地址归一化）', () => {
  it('运行时与构建期都未配置时回退 /api', () => {
    expect(normalizeApiBaseUrl(undefined, '')).toBe(DEFAULT_API_BASE_URL);
  });

  it('运行时配置为空字符串时沿用构建期配置', () => {
    expect(normalizeApiBaseUrl('', '/api')).toBe('/api');
  });

  it('去掉末尾多余斜杠', () => {
    expect(normalizeApiBaseUrl('/api/', '')).toBe('/api');
    expect(normalizeApiBaseUrl('https://mes.example.com/api//', '')).toBe(
      'https://mes.example.com/api',
    );
  });

  it('只填协议+主机时自动补 /api', () => {
    expect(normalizeApiBaseUrl('http://192.168.1.100:3000', '')).toBe(
      'http://192.168.1.100:3000/api',
    );
  });

  it('运行时配置优先于构建期配置', () => {
    expect(
      normalizeApiBaseUrl('http://10.0.0.8:3000/api', '/api'),
    ).toBe('http://10.0.0.8:3000/api');
  });

  it('两端空白会被清除', () => {
    expect(normalizeApiBaseUrl('  /api  ', '')).toBe('/api');
  });
});

describe('normalizeBasePath（部署基路径归一化）', () => {
  it('未配置时返回根路径 /', () => {
    expect(normalizeBasePath(undefined, '')).toBe('/');
    expect(normalizeBasePath('', '')).toBe('/');
  });

  it('自动补齐首尾斜杠', () => {
    expect(normalizeBasePath('mes', '')).toBe('/mes/');
    expect(normalizeBasePath('/mes', '')).toBe('/mes/');
    expect(normalizeBasePath('/mes/', '')).toBe('/mes/');
  });

  it('多级子路径同样规范化', () => {
    expect(normalizeBasePath('factory/mes', '')).toBe('/factory/mes/');
  });
});

describe('resolveAppPath（应用内路径拼基路径）', () => {
  it('根路径部署时保持原样', () => {
    expect(resolveAppPath('/login')).toBe('/login');
  });

  it('绝对 URL 原样返回', () => {
    expect(resolveAppPath('http://example.com/x')).toBe('http://example.com/x');
  });
});

describe('readRawRuntimeConfig', () => {
  afterEach(() => {
    // 清理用例注入的运行时配置，避免影响其他测试
    delete (window as Window & { __MES_CONFIG__?: unknown }).__MES_CONFIG__;
  });

  it('无 window 配置时返回空对象而不是抛错', () => {
    expect(readRawRuntimeConfig()).toEqual({});
  });

  it('读取部署后注入的 window.__MES_CONFIG__', () => {
    (window as Window & { __MES_CONFIG__?: unknown }).__MES_CONFIG__ = {
      API_BASE_URL: 'http://10.0.0.1:3000/api',
      APP_TITLE: '一号车间 MES',
      BASE_PATH: '/mes/',
    };

    expect(readRawRuntimeConfig()).toEqual({
      API_BASE_URL: 'http://10.0.0.1:3000/api',
      APP_TITLE: '一号车间 MES',
      BASE_PATH: '/mes/',
    });
  });

  it('配置值不是对象时返回空对象（容错）', () => {
    (window as Window & { __MES_CONFIG__?: unknown }).__MES_CONFIG__ = 'invalid';
    expect(readRawRuntimeConfig()).toEqual({});
  });
});

describe('runtimeConfig - 解析结果与派生能力', () => {
  const originalBasePath = runtimeConfig.basePath;

  afterEach(() => {
    runtimeConfig.basePath = originalBasePath;
  });

  it('包含 API 地址、标题、基路径与版本号', () => {
    expect(typeof runtimeConfig.apiBaseUrl).toBe('string');
    expect(runtimeConfig.appTitle.length).toBeGreaterThan(0);
    expect(runtimeConfig.basePath.endsWith('/')).toBe(true);
    expect(typeof runtimeConfig.version).toBe('string');
  });

  it('根路径部署时 routerBasename 为 undefined', () => {
    expect(routerBasename).toBeUndefined();
  });

  it('applyRuntimeConfig 同步浏览器标题', () => {
    applyRuntimeConfig();
    expect(document.title).toBe(runtimeConfig.appTitle);
  });

  it('buildHealthUrl 基于当前 API 地址拼接', () => {
    expect(buildHealthUrl()).toBe(`${runtimeConfig.apiBaseUrl}/health`);
  });

  it('子路径部署时 resolveAppPath 自动加前缀', () => {
    runtimeConfig.basePath = '/mes/';

    expect(resolveAppPath('/login')).toBe('/mes/login');
    expect(resolveAppPath('login')).toBe('/mes/login');
  });
});
