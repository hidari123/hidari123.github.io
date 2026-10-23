---
title: "TypeScript 高级技巧与设计模式实战"
date: "2026-05-18"
tags: [前端工程, 工程实践, TypeScript]
cover: ""
description: "条件类型什么时候该用什么时候别用——包括为什么我在一个项目里花两天写的类型体操最后全部删掉，换成了一个 20 行的运行时校验。"
---

# TypeScript 高级技巧与设计模式实战

这篇里的类型体操大部分是对的，但我要先说结论：**其中有一半我不建议你在项目里用。**

我试过。在一个真实项目里花了两天写一套递归的表单类型推导，
编译通过了，读代码的人花了一个星期才看懂，然后需求一变，推导链条崩了三处。
最后我把它删掉，换成一个 20 行的运行时校验，反而更快更稳。

所以下面每节我都标了「什么时候值得」和「什么时候别碰」。

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

类型体操的收益和成本是完全不对称的：

**值得用的**：模板字面量类型、工具类型（`Required`/`Partial`/`Pick`）——
它们短、常见、报错信息直接告诉你哪里错了。

**不建议用的**：三层以上的条件类型嵌套、递归条件类型、`infer` 套 `infer`。
它们的共同特征是**报错信息变成了一堵墙**。你写的时候很爽，
出错了只能一行行注释掉才知道是哪层炸的。

一条我自己一直用的判断标准：**如果这个类型需要加注释解释，它就不该存在。**
真正的边界校验应该放在运行时——`zod`、`valibot` 这类库才是干这个的。

反过来说，类型系统最该用在哪？不是「证明我的代码对」，而是「让错误的调用在编译期就挂掉」，
比如 `Handler = on${Capitalize<EventName>}` 这种——
它直接消掉了一整类拼写错误，这是纯赚的。
