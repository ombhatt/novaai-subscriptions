import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";

describe("ui extras", () => {
  it("renders unused progress label and value slots", () => {
    render(
      <Progress value={40}>
        <ProgressLabel>Usage</ProgressLabel>
        <ProgressValue />
      </Progress>,
    );

    expect(screen.getByText("Usage")).toBeInTheDocument();
  });

  it("renders a card action slot", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          <CardAction>Edit</CardAction>
        </CardHeader>
      </Card>,
    );

    expect(screen.getByText("Edit")).toBeInTheDocument();
  });
});
