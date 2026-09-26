// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createPortal } from "react-dom";
import type { ColumnDef } from "@tanstack/react-table";

const push = vi.fn();
const prefetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch, refresh: vi.fn() }) }));

import { DataTable } from "./data-table";

type Row = { id: string; name: string };
const data: Row[] = [{ id: "a1", name: "Acme Roofing" }, { id: "b2", name: "Beta Paving" }];

function Menu({ onPick }: { onPick: () => void }) {
  // Simulates a Radix menu: the trigger is inside the row, the menu content is portaled to <body>.
  return (
    <span>
      <button aria-label="More actions">⋯</button>
      {createPortal(<button onClick={onPick}>Portaled item</button>, document.body)}
    </span>
  );
}

const columns = (onPick = vi.fn()): ColumnDef<Row>[] => [
  { accessorKey: "name", header: "Client", cell: ({ row }) => <span>{row.original.name}</span> },
  { id: "actions", header: "", cell: () => <Menu onPick={onPick} /> },
];

describe("DataTable row navigation", () => {
  beforeEach(() => { push.mockClear(); prefetch.mockClear(); });

  it("navigates on a single click anywhere on the row", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns()} data={data} getRowHref={(r) => `/clients/${r.id}`} rowLabel={(r) => `Open ${r.name}`} />);
    await user.click(screen.getByText("Acme Roofing"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/clients/a1");
  });

  it("is keyboard accessible: rows are focusable, named, and open with Enter", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns()} data={data} getRowHref={(r) => `/clients/${r.id}`} rowLabel={(r) => `Open ${r.name}`} />);
    const row = screen.getByRole("row", { name: "Open Beta Paving" });
    expect(row).toHaveAttribute("tabindex", "0");
    row.focus();
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/clients/b2");
  });

  it("does not navigate when the overflow-menu trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns()} data={data} getRowHref={(r) => `/clients/${r.id}`} />);
    await user.click(screen.getAllByRole("button", { name: "More actions" })[0]);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not navigate for clicks inside portaled menu/dialog content (React bubbles through portals)", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<DataTable columns={columns(onPick)} data={data} getRowHref={(r) => `/clients/${r.id}`} />);
    await user.click(screen.getAllByRole("button", { name: "Portaled item" })[0]);
    expect(onPick).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("prefetches the destination on hover", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns()} data={data} getRowHref={(r) => `/clients/${r.id}`} />);
    await user.hover(screen.getByText("Acme Roofing"));
    expect(prefetch).toHaveBeenCalledWith("/clients/a1");
  });

  it("rows are inert when no click behaviour is configured", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns()} data={data} />);
    const row = screen.getByText("Acme Roofing").closest("tr")!;
    expect(row).not.toHaveAttribute("tabindex");
    await user.click(screen.getByText("Acme Roofing"));
    expect(push).not.toHaveBeenCalled();
  });

  it("still supports onRowClick (e.g. opening a drawer)", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<DataTable columns={columns()} data={data} onRowClick={onRowClick} />);
    await user.click(screen.getByText("Beta Paving"));
    expect(onRowClick).toHaveBeenCalledWith(data[1]);
  });
});
