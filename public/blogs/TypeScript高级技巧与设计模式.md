---
title: "TypeScript 高级技巧与设计模式实战"
date: "2026-05-18"
tags: ["TypeScript", "设计模式", "类型编程", "最佳实践"]
cover: ""
description: "深入讲解 TypeScript 高级类型系统、装饰器、声明文件编写，以及常见设计模式的 TypeScript 实现"
---

# TypeScript 高级技巧与设计模式实战

TypeScript 已经成为现代前端开发的标配。本文将深入讲解 TypeScript 的高级特性,帮助你写出更健壮、更可维护的代码。

## 高级类型系统

### 1. 模板字面量类型

```typescript
// 模板字面量类型基础
type EventName = "click" | "focus" | "blur";
type Handler = `on${Capitalize<EventName>}`;
// Handler = "onClick" | "onFocus" | "onBlur"

// 提取路径类型
type ExtractRoute<T extends string> = T extends `${infer Method} ${infer Path}`
  ? { method: Method; path: Path }
  : never;

type Route = ExtractRoute<"GET /api/users">;
// Route = { method: "GET"; path: "/api/users" }

// CSS 属性类型生成
type CSSProperties = {
  [K in `--${string}`]: string | number;
};

const styles: CSSProperties = {
  "--primary-color": "#1890ff",
  "--spacing": "8px",
  "--animation-duration": 300,
};
```

### 2. 分布式条件类型

```typescript
// 分布式条件类型
type ToArray<T> = T extends any ? T[] : never;

type StrArr = ToArray<string>; // string[]
type NumArr = ToArray<number>; // number[]
type AllArr = ToArray<string | number>; // string[] | number[]

// 非分布式版本
type ToArrayNonDist<T> = [T] extends [any] ? T[] : never;

type AllArrNonDist = ToArrayNonDist<string | number>; // (string | number)[]

// 实际应用: 过滤类型
type Filter<T, U> = T extends U ? never : T;

type Filtered = Filter<"a" | "b" | "c", "a" | "b">; // "c"
type Numbers = Filter<1 | 2 | 3 | string, number>; // 1 | 2 | 3
```

### 3. 递归类型

```typescript
// 深Partial实现
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

interface Config {
  database: {
    host: string;
    port: number;
    credentials: {
      username: string;
      password: string;
    };
  };
}

type PartialConfig = DeepPartial<Config>;
// 所有嵌套属性都变为可选

// JSON类型
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

interface User {
  name: string;
  metadata: JSONValue;
}

const user: User = {
  name: "Alice",
  metadata: {
    tags: ["admin", "vip"],
    extra: { level: 10 },
  },
};

// 深度只读
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};
```

## 装饰器

### 1. 类装饰器

```typescript
// 日志装饰器
function Log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;

  descriptor.value = function (...args: any[]) {
    console.log(`Calling ${propertyKey} with`, args);
    const result = original.apply(this, args);
    console.log(`Result:`, result);
    return result;
  };

  return descriptor;
}

// 单例装饰器
function Singleton<T extends { new (...args: any[]): {} }>(constructor: T) {
  return class SingletonClass extends constructor {
    private static instance: T | null = null;

    static getInstance(...args: any[]): T {
      if (!SingletonClass.instance) {
        SingletonClass.instance = new constructor(...args);
      }
      return SingletonClass.instance;
    }
  };
}

@Singleton
class Database {
  constructor(private url: string) {}
}

const db1 = Database.getInstance("mongodb://localhost");
const db2 = Database.getInstance("mysql://localhost");
console.log(db1 === db2); // true
```

### 2. 方法装饰器

```typescript
// 重试装饰器
function Retry(maxAttempts: number = 3) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await original.apply(this, args);
        } catch (error) {
          lastError = error as Error;
          console.log(`Attempt ${attempt} failed:`, error);
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}

class ApiService {
  @Retry(3)
  async fetchData(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Request failed");
    return response.json();
  }
}
```

## 设计模式实现

### 1. 单例模式

```typescript
class AppConfig {
  private static instance: AppConfig;
  public readonly apiUrl: string;
  public readonly maxRetries: number;

  private constructor() {
    this.apiUrl = process.env.API_URL || "http://localhost:3000";
    this.maxRetries = 3;
  }

  static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }
}

const config1 = AppConfig.getInstance();
const config2 = AppConfig.getInstance();
console.log(config1 === config2); // true
```

### 2. 工厂模式

```typescript
interface Button {
  render(): void;
  onClick(handler: () => void): void;
}

class PrimaryButton implements Button {
  render() {
    console.log("Rendering Primary Button");
  }
  onClick(handler: () => void) {
    console.log("Primary click");
    handler();
  }
}

class SecondaryButton implements Button {
  render() {
    console.log("Rendering Secondary Button");
  }
  onClick(handler: () => void) {
    console.log("Secondary click");
    handler();
  }
}

type ButtonType = "primary" | "secondary";

class ButtonFactory {
  static create(type: ButtonType): Button {
    switch (type) {
      case "primary":
        return new PrimaryButton();
      case "secondary":
        return new SecondaryButton();
      default:
        throw new Error(`Unknown button type: ${type}`);
    }
  }
}

const primaryBtn = ButtonFactory.create("primary");
primaryBtn.render();
```

### 3. 观察者模式

```typescript
type EventHandler<T = any> = (data: T) => void;

class EventEmitter<T = any> {
  private handlers: Map<string, Set<EventHandler<T>>> = new Map();

  on(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // 返回取消订阅函数
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler<T>): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, data: T): void {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }
}

// 使用示例
interface UserEvent {
  userId: string;
  action: string;
}

const emitter = new EventEmitter<UserEvent>();

const unsubscribe = emitter.on("userAction", (data) => {
  console.log("User action:", data);
});

emitter.emit("userAction", { userId: "123", action: "login" });

// 取消订阅
unsubscribe();
```

## 实用工具类型

```typescript
// PickByValue: 根据值类型选取键
type PickByValue<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K];
};

interface User {
  id: number;
  name: string;
  age: number;
  active: boolean;
}

type StringProps = PickByValue<User, string>; // { name: string }

// OmitByValue: 根据值类型排除键
type OmitByValue<T, V> = {
  [K in keyof T as T[K] extends V ? never : K]: T[K];
};

type NonStringProps = OmitByValue<User, string>; // { id: number; age: number; active: boolean }

// RequiredKeys: 获取必填键
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

type UserRequired = RequiredKeys<User>; // "id" | "name" | "age" | "active"

// OptionalKeys: 获取可选键
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

type UserOptional = OptionalKeys<User>; // never (假设所有字段都是必填)
```

## 总结

TypeScript 的高级特性为我们提供了强大的类型系统能力:

1. **模板字面量类型**: 创建精确的字符串类型
2. **条件类型**: 根据类型条件动态构建新类型
3. **递归类型**: 处理嵌套结构
4. **装饰器**: 修改类和类成员的行为
5. **设计模式**: 用类型安全的方式实现经典模式

> 💡 **最佳实践**: 不要过度使用高级类型特性,保持代码可读性和可维护性同样重要。

祝你 TypeScript 技能越来越强! 🎉
