"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DashNav } from "@/components/DashNav";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

const freeModels = [
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B", cost: "~$0.004/job", tag: "Standard", tagHighlight: false },
  { id: "mistralai/mistral-7b-instruct:free", name: "Mistral 7B", cost: "~$0.005/job", tag: "Standard", tagHighlight: false },
  { id: "google/gemma-2-9b-it:free", name: "Gemma 2 9B", cost: "~$0.005/job", tag: "Better reasoning", tagHighlight: true },
];

const proModels = [
  { id: "anthropic/claude-3.5-haiku", name: "Claude Haiku 3.5", cost: "~$0.20/job", tag: "Best quality" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini", cost: "~$0.12/job", tag: "Best quality" },
];

export default function ModelSettingsPage() {
  const [selectedModel, setSelectedModel] = useState<string>(freeModels[0].id);
  const [savedModel, setSavedModel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    { kind: "success"; message: string } | { kind: "error"; message: string } | null
  >(null);
  const [user, setUser] = useState<{ display_name: string | null; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [agentsRes, userRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/user/me"),
        ]);
        const agentsData = await agentsRes.json();
        const userData = await userRes.json();

        if (agentsData.agents && agentsData.agents.length > 0) {
          const agentModel = agentsData.agents[0].model;
          const allIds = [...freeModels.map((m) => m.id), ...proModels.map((m) => m.id)];
          if (allIds.includes(agentModel)) {
            setSelectedModel(agentModel);
            setSavedModel(agentModel);
          } else {
            const match = allIds.find((id) => id.includes(agentModel) || agentModel.includes(id));
            if (match) {
              setSelectedModel(match);
              setSavedModel(match);
            }
          }
        }

        if (userData.user) {
          setUser({ display_name: userData.user.display_name, email: userData.user.email });
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  async function handleSave() {
    setSaveStatus(null);
    setSaving(true);
    try {
      const res = await fetch("/api/user/model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus({
          kind: "error",
          message: data.error || `Failed (HTTP ${res.status})`,
        });
        return;
      }
      setSavedModel(selectedModel);
      const n = data.agents_updated ?? 0;
      setSaveStatus({
        kind: "success",
        message:
          n === 0
            ? "Preference saved. It'll apply when you create your first agent."
            : `Updated ${n} agent${n === 1 ? "" : "s"} to this model.`,
      });
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err) {
      setSaveStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = savedModel !== selectedModel;

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <DashNav />
        <div className="px-16 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-surface rounded-lg" />
            <div className="h-4 w-64 bg-surface rounded-lg mt-2" />
            <div className="space-y-3 mt-6">
              <div className="h-14 bg-surface rounded-xl" />
              <div className="h-14 bg-surface rounded-xl" />
              <div className="h-14 bg-surface rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashNav user={user || undefined} />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="flex flex-col"
      >
        {/* Header */}
        <motion.div variants={fadeUp} className="px-16 py-8 max-w-[800px]">
          <h1 className="font-heading font-bold text-[28px] text-cream">
            Model Settings
          </h1>
          <p className="text-[15px] text-muted mt-2">
            Which model powers your agent. Switch anytime — updates immediately.
          </p>
        </motion.div>

        {/* Free models section */}
        <motion.div variants={fadeUp} className="px-16 max-w-[800px] mt-6">
          <p className="text-[14px] text-cream font-medium mb-4">
            Free models — included with Starter
          </p>
          <div className="flex flex-col gap-3">
            {freeModels.map((model) => {
              const isSelected = selectedModel === model.id;
              return (
                <div
                  key={model.name}
                  onClick={() => setSelectedModel(model.id)}
                  className={`rounded-xl px-5 py-3.5 flex items-center border cursor-pointer ${
                    isSelected
                      ? "border-success bg-success/5"
                      : "border-border"
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isSelected
                        ? "bg-success"
                        : "border-2 border-muted"
                    }`}
                  />
                  <span className="text-[15px] text-cream flex-1 ml-3">
                    {model.name}
                  </span>
                  <span className="text-sm text-muted mr-4">{model.cost}</span>
                  <span
                    className={`text-sm ${
                      model.tagHighlight ? "text-terracotta" : "text-muted"
                    }`}
                  >
                    {model.tag}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Pro models section */}
        <motion.div variants={fadeUp} className="px-16 max-w-[800px] mt-8">
          <p className="text-[14px] text-cream font-medium mb-4">
            Pro models — upgrade required
          </p>
          <div className="flex flex-col gap-3">
            {proModels.map((model) => (
              <div
                key={model.name}
                className="rounded-xl px-5 py-3.5 flex items-center border border-border opacity-50 cursor-not-allowed"
              >
                <div className="w-3 h-3 rounded-full border-2 border-muted" />
                <span className="text-[15px] text-cream flex-1 ml-3">
                  {model.name}
                </span>
                <span className="text-sm text-muted mr-4">{model.cost}</span>
                <span className="text-sm text-muted">{model.tag}</span>
                <span className="bg-terracotta/15 text-terracotta text-[11px] font-medium px-2 py-0.5 rounded-full ml-2">
                  Pro only
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Save button */}
        <motion.div variants={fadeUp} className="px-16 max-w-[800px] mt-8 flex items-center gap-4 flex-wrap">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-6 py-2.5 bg-terracotta rounded-full text-[14px] font-medium text-off-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? "Saving..." : hasChanges ? "Save changes" : "Saved"}
          </button>
          {saveStatus && (
            <p
              className={`text-sm ${
                saveStatus.kind === "success" ? "text-success" : "text-red-400"
              }`}
            >
              {saveStatus.message}
            </p>
          )}
        </motion.div>

        {/* BYOK note (not yet wired) */}
        <motion.div variants={fadeUp} className="px-16 max-w-[800px] mt-8 mb-16">
          <div className="rounded-[20px] border border-border p-8">
            <h2 className="font-medium text-[15px] text-cream">
              Bring your own API key
            </h2>
            <p className="text-[14px] text-muted mt-2 leading-6">
              Coming soon. You&apos;ll be able to paste any OpenRouter,
              Anthropic, or OpenAI key for unlimited jobs at direct cost.
              Until then, pick a free model above.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
