"use client";

import { Typography } from "antd";

export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-8">
      {eyebrow ? <Typography.Text type="secondary">{eyebrow}</Typography.Text> : null}
      <Typography.Title level={1} className="!mb-2 !mt-1 !text-3xl !tracking-tight">{title}</Typography.Title>
      <Typography.Paragraph type="secondary" className="!mb-0 !max-w-2xl !text-base">{description}</Typography.Paragraph>
    </header>
  );
}
