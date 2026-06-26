"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, CheckCircle2, Lock, BookOpen, Sparkles } from "lucide-react";

const STEPS = [
  {
    id: "workspace",
    title: "Create your workspace",
    description: "Set up your first workspace to start protecting your agentic payments.",
  },
  {
    id: "api-key",
    title: "Generate an API key",
    description: "Create an API key to authenticate your requests.",
  },
  {
    id: "integration",
    title: "Integrate the SDK",
    description: "Add IntentGuard to your agent with just a few lines of code.",
  },
  {
    id: "test",
    title: "Test your integration",
    description: "Verify that everything is working correctly.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [workspaceName, setWorkspaceName] = useState("");
  const [apiKeyCreated, setApiKeyCreated] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      router.push("/dashboard");
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreateWorkspace = () => {
    if (workspaceName.trim()) {
      handleNext();
    }
  };

  const handleCreateApiKey = () => {
    const newKey = `ig_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    setApiKey(newKey);
    setApiKeyCreated(true);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Workspace Name</label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g., Production"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                autoFocus
              />
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                Tip
              </h4>
              <p className="text-sm text-zinc-400">
                You can create multiple workspaces later to separate different environments (dev, staging, production).
              </p>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            {!apiKeyCreated ? (
              <>
                <p className="text-zinc-400">
                  Create an API key to authenticate your requests. This key will have admin privileges.
                </p>
                <button
                  onClick={handleCreateApiKey}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white font-medium py-3 rounded-lg transition-colors"
                >
                  Generate API Key
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="bg-emerald-900/30 border border-emerald-500/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="font-medium text-emerald-400">API Key Created</span>
                  </div>
                  <p className="text-sm text-zinc-400 mb-3">Copy this key now. You won&apos;t be able to see it again.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-zinc-900 px-3 py-2 rounded text-sm font-mono text-emerald-300">
                      {apiKey}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(apiKey)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded text-sm transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-4">
                  <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-violet-400" />
                    Security Note
                  </h4>
                  <p className="text-sm text-zinc-400">
                    Store this key securely in your environment variables. Never commit it to version control.
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <p className="text-zinc-400">
              Add the IntentGuard SDK to your project and initialize it with your API key.
            </p>
            <div className="bg-zinc-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-zinc-300 font-mono">
                <code>{`npm install intentguard`}</code>
              </pre>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-zinc-300 font-mono">
                <code>{`import { createIntentGuardClient } from "intentguard/sdk";

const ig = createIntentGuardClient({
  apiKey: "${apiKey || "YOUR_API_KEY"}",
  baseUrl: "https://your-deployment.vercel.app",
});`}</code>
              </pre>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-400" />
                Next Steps
              </h4>
              <p className="text-sm text-zinc-400">
                Check out our documentation for more examples and advanced configurations.
              </p>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <p className="text-zinc-400">
              Make your first verification call to ensure everything is working correctly.
            </p>
            <div className="bg-zinc-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-zinc-300 font-mono">
                <code>{`const decision = await ig.verify({
  intent_id: "test_001",
  agent_id: "test_agent",
  amount: 100,
  currency: "USD",
  recipient: "vendor@example.com",
  agent_context: "Test transaction",
});

console.log(decision);`}</code>
              </pre>
            </div>
            <div className="bg-emerald-900/30 border border-emerald-500/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-6 h-6 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-emerald-400">You&apos;re all set!</h4>
                  <p className="text-sm text-zinc-400">
                    Your workspace is configured and ready to protect your agentic payments.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#09090e] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index <= currentStep
                      ? "bg-violet-600 text-white"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {index < currentStep ? "✓" : index + 1}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`w-16 h-1 mx-2 ${
                      index < currentStep ? "bg-violet-600" : "bg-zinc-800"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            {STEPS.map((step) => (
              <span key={step.id} className={currentStep === STEPS.indexOf(step) ? "text-violet-400" : ""}>
                {step.title}
              </span>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
          <h2 className="text-2xl font-semibold text-white mb-2">{STEPS[currentStep].title}</h2>
          <p className="text-zinc-400 mb-6">{STEPS[currentStep].description}</p>
          
          {renderStep()}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-zinc-800">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className="px-4 py-2 text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>
            <button
              onClick={
                currentStep === 0
                  ? handleCreateWorkspace
                  : currentStep === 1 && !apiKeyCreated
                  ? () => {}
                  : handleNext
              }
              disabled={
                (currentStep === 0 && !workspaceName.trim()) ||
                (currentStep === 1 && !apiKeyCreated)
              }
              className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentStep === STEPS.length - 1 ? "Go to Dashboard" : "Next"}
            </button>
          </div>
        </div>

        {/* Skip */}
        {currentStep < STEPS.length - 1 && (
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full mt-4 text-sm text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Skip onboarding
          </button>
        )}
      </div>
    </div>
  );
}
