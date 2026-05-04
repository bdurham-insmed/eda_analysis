import { useState } from "react";
import axios from "axios";
import { API_BASE } from "../../constants.ts";
import type { Parameter } from "../../types.ts";
import { errorMessage } from "./errors.ts";
import { emptyParameterDraft, type ParameterDraft } from "./types.ts";

type Result = {
  showNewParam: boolean;
  setShowNewParam: React.Dispatch<React.SetStateAction<boolean>>;
  newParam: ParameterDraft;
  setNewParam: React.Dispatch<React.SetStateAction<ParameterDraft>>;
  submit: () => Promise<void>;
};

type Args = {
  onCreated: (p: Parameter) => void;
  onError: (msg: string) => void;
};

export function useNewParameter({ onCreated, onError }: Args): Result {
  const [showNewParam, setShowNewParam] = useState(false);
  const [newParam, setNewParam] = useState<ParameterDraft>(emptyParameterDraft);

  const submit = async () => {
    if (!newParam.name.trim()) {
      onError("Parameter name is required");
      return;
    }
    if (newParam.type === "select") {
      const opts = newParam.options.split(",").map((o) => o.trim()).filter(Boolean);
      if (opts.length === 0) {
        onError("Select-type parameters need options");
        return;
      }
    }
    const body = {
      name: newParam.name.trim(),
      type: newParam.type,
      description: newParam.description.trim() || null,
      options:
        newParam.type === "select"
          ? newParam.options.split(",").map((o) => o.trim()).filter(Boolean)
          : null,
      required: newParam.required,
      default_value: newParam.default_value.trim() || null,
    };
    try {
      const res = await axios.post<Parameter>(`${API_BASE}/workflow-parameters`, body);
      onCreated(res.data);
      setNewParam(emptyParameterDraft);
      setShowNewParam(false);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return { showNewParam, setShowNewParam, newParam, setNewParam, submit };
}
