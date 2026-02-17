import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { renderWithQuery } from "@/test/render";
import CreateUserForm from "./CreateUserForm";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, { deep: true });

const onSuccess = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
});

function renderForm() {
  const user = userEvent.setup();
  renderWithQuery(<CreateUserForm onSuccess={onSuccess} />);
  return { user };
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { name = "John Doe", email = "john@example.com", password = "password123" } = {}
) {
  await user.type(screen.getByLabelText("Name"), name);
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
}

describe("CreateUserForm", () => {
  it("should render all form fields and submit button", () => {
    renderForm();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create User" })).toBeInTheDocument();
  });

  it("should show validation error for short name", async () => {
    const { user } = renderForm();

    await fillForm(user, { name: "Ab" });
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(screen.getByText("Name must be at least 3 characters")).toBeInTheDocument();
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("should show validation error for short password", async () => {
    const { user } = renderForm();

    await fillForm(user, { password: "short" });
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("should show validation error for missing email", async () => {
    const { user } = renderForm();

    await user.type(screen.getByLabelText("Name"), "John Doe");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email address")).toBeInTheDocument();
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("should set aria-invalid on fields with errors", async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    });
  });

  it("should call POST /api/users with form data on valid submit", async () => {
    mockedAxios.post.mockResolvedValue({ data: { user: { id: "1" } } });
    const { user } = renderForm();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/users", {
        name: "John Doe",
        email: "john@example.com",
        password: "password123",
      });
    });
  });

  it("should call onSuccess after successful creation", async () => {
    mockedAxios.post.mockResolvedValue({ data: { user: { id: "1" } } });
    const { user } = renderForm();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("should reset the form after successful creation", async () => {
    mockedAxios.post.mockResolvedValue({ data: { user: { id: "1" } } });
    const { user } = renderForm();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toHaveValue("");
      expect(screen.getByLabelText("Email")).toHaveValue("");
      expect(screen.getByLabelText("Password")).toHaveValue("");
    });
  });

  it("should display server error message on 409 conflict", async () => {
    const error = new Error("Conflict");
    Object.assign(error, {
      response: { status: 409, data: { error: "Email already exists" } },
    });
    mockedAxios.post.mockRejectedValue(error);
    mockedAxios.isAxiosError.mockReturnValue(true);
    const { user } = renderForm();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(screen.getByText("Email already exists")).toBeInTheDocument();
    });
  });

  it("should show generic error for non-Axios errors", async () => {
    mockedAxios.post.mockRejectedValue(new Error("Network failure"));
    mockedAxios.isAxiosError.mockReturnValue(false);
    const { user } = renderForm();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to create user")).toBeInTheDocument();
    });
  });

  it("should show 'Creating...' and disable button while submitting", async () => {
    mockedAxios.post.mockReturnValue(new Promise(() => {}));
    const { user } = renderForm();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Creating..." });
      expect(button).toBeDisabled();
    });
  });
});
