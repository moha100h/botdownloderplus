import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Bot, 
  Settings, 
  Play, 
  Square, 
  RefreshCw, 
  Link as LinkIcon, 
  Settings2, 
  DownloadCloud, 
  ChevronDown,
  Activity,
  Radio,
  User,
  Hash
} from "lucide-react";
import { SiYoutube, SiSpotify, SiInstagram } from "react-icons/si";

import { useSetupBot, useGetBotStatus, getGetBotStatusQueryKey, useStopBot, useRestartBot } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  token: z.string().regex(/^\d+:[A-Za-z0-9_-]{35,}$/, "فرمت توکن نامعتبر است"),
  adminId: z.coerce.number().positive("شناسه باید یک عدد مثبت باشد"),
  maxFileSizeMb: z.coerce.number().min(1).max(2000).default(50),
  rateLimitRequests: z.coerce.number().min(1).max(100).default(5),
});

type FormValues = z.infer<typeof formSchema>;

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const setupRef = useRef<HTMLDivElement>(null);

  // Queries & Mutations
  const { data: botStatus, isLoading: isStatusLoading } = useGetBotStatus({
    query: { refetchInterval: 5000 }
  });
  
  const setupBot = useSetupBot();
  const stopBot = useStopBot();
  const restartBot = useRestartBot();

  // Form Setup
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      token: "",
      adminId: undefined,
      maxFileSizeMb: 50,
      rateLimitRequests: 5,
    },
  });

  const onSubmit = (data: FormValues) => {
    setupBot.mutate({ data }, {
      onSuccess: (res) => {
        toast({
          title: "راه‌اندازی موفق",
          description: `ربات ${res.botUsername || ""} با موفقیت فعال شد.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
        form.reset({ token: "", adminId: undefined, maxFileSizeMb: 50, rateLimitRequests: 5 });
      },
      onError: (err: any) => {
        toast({
          title: "خطا در راه‌اندازی",
          description: err?.error || "ارتباط با سرور برقرار نشد",
          variant: "destructive",
        });
      }
    });
  };

  const handleStop = () => {
    stopBot.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "ربات متوقف شد" });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      }
    });
  };

  const handleRestart = () => {
    restartBot.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "ربات راه‌اندازی مجدد شد" });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      }
    });
  };

  const scrollToSetup = () => {
    setupRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const isRunning = botStatus?.running ?? false;

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden flex justify-center">
        <div className="w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] absolute -top-40 -left-20 opacity-50 mix-blend-screen" />
        <div className="w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px] absolute top-1/3 -right-20 opacity-40 mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 md:py-24 space-y-32">
        
        {/* 1. Hero Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-8 flex flex-col items-center pt-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-medium mb-4">
            <Activity className="w-4 h-4" />
            <span>مدیریت یکپارچه دانلودها</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-tight">
            ربات دانلودر <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-400">تلگرام</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            سریع، قدرتمند و بدون محدودیت. مدیاهای خود را از یوتوب، اسپاتیفای و اینستاگرام با بالاترین کیفیت دانلود کنید.
          </p>
          <div className="pt-8">
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg font-medium rounded-full shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)] hover:shadow-[0_0_60px_-10px_rgba(59,130,246,0.7)] transition-all"
              onClick={scrollToSetup}
              data-testid="button-scroll-setup"
            >
              <Settings className="w-5 h-5 ml-2" />
              راه‌اندازی ربات
            </Button>
          </div>
        </motion.section>

        {/* 2. Features Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="space-y-10"
        >
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold">پشتیبانی از پلتفرم‌های محبوب</h2>
            <p className="text-muted-foreground">دانلود از شبکه‌های اجتماعی تنها با ارسال یک لینک</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* YouTube */}
            <Card className="bg-card/50 border-card-border backdrop-blur-sm hover:border-red-500/30 transition-colors group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-4 text-red-500">
                  <SiYoutube className="w-6 h-6" />
                </div>
                <CardTitle>یوتوب</CardTitle>
                <CardDescription>ویدیو و صدا</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />کیفیت 360p تا 1080p</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />استخراج مستقیم MP3</li>
                </ul>
              </CardContent>
            </Card>

            {/* Spotify */}
            <Card className="bg-card/50 border-card-border backdrop-blur-sm hover:border-green-500/30 transition-colors group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mb-4 text-green-500">
                  <SiSpotify className="w-6 h-6" />
                </div>
                <CardTitle>اسپاتیفای</CardTitle>
                <CardDescription>موسیقی و پادکست</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />دانلود با کیفیت 320kbps</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />حفظ کاور و متادیتا</li>
                </ul>
              </CardContent>
            </Card>

            {/* Instagram */}
            <Card className="bg-card/50 border-card-border backdrop-blur-sm hover:border-fuchsia-500/30 transition-colors group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-fuchsia-500/10 flex items-center justify-center mb-4 text-fuchsia-500">
                  <SiInstagram className="w-6 h-6" />
                </div>
                <CardTitle>اینستاگرام</CardTitle>
                <CardDescription>پست، ریلز و استوری</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500/50" />دانلود ریلز با بالاترین کیفیت</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500/50" />پشتیبانی از پست‌های اسلایدی</li>
                </ul>
              </CardContent>
            </Card>

            {/* Radio Javan */}
            <Card className="bg-card/50 border-card-border backdrop-blur-sm hover:border-orange-500/30 transition-colors group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4 text-orange-500">
                  <Radio className="w-6 h-6" />
                </div>
                <CardTitle>رادیو جوان</CardTitle>
                <CardDescription>موزیک و موزیک ویدیو</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-orange-500/50" />دانلود آهنگ‌های جدید</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-orange-500/50" />پشتیبانی از موزیک ویدیوها</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </motion.section>

        {/* 3. How it works */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-card/30 border border-card-border rounded-3xl p-8 md:p-12 backdrop-blur-md">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold">چگونه کار می‌کند؟</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Connection Line */}
              <div className="hidden md:block absolute top-8 left-1/6 right-1/6 h-[1px] bg-border z-0" />
              
              <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center shadow-lg shadow-black/20">
                  <LinkIcon className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">۱. ارسال لینک</h3>
                  <p className="text-sm text-muted-foreground mt-2">لینک محتوای مورد نظر خود را برای ربات ارسال کنید.</p>
                </div>
              </div>

              <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center shadow-lg shadow-black/20">
                  <Settings2 className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">۲. انتخاب کیفیت</h3>
                  <p className="text-sm text-muted-foreground mt-2">فرمت و کیفیت دلخواه خود را از منوی شیشه‌ای انتخاب کنید.</p>
                </div>
              </div>

              <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center shadow-lg shadow-black/20">
                  <DownloadCloud className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">۳. دانلود فایل</h3>
                  <p className="text-sm text-muted-foreground mt-2">فایل شما در سریع‌ترین زمان مستقیماً در تلگرام آپلود می‌شود.</p>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* 4. Setup / Control Panel */}
        <motion.section 
          ref={setupRef}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold">پنل مدیریت ربات</h2>
            <p className="text-muted-foreground mt-2">وضعیت ربات خود را بررسی کنید یا تنظیمات جدید اعمال کنید.</p>
          </div>

          <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-xl overflow-hidden">
            {/* Status Banner */}
            <div className="bg-muted/30 border-b border-border p-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative flex h-4 w-4">
                  {isRunning ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-muted-foreground"></span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    وضعیت سیستم: 
                    <span className={isRunning ? "text-green-500" : "text-muted-foreground"}>
                      {isStatusLoading ? "در حال بررسی..." : isRunning ? "فعال" : "متوقف شده"}
                    </span>
                  </h3>
                  {botStatus?.setupDone && botStatus?.botUsername && (
                    <p className="text-sm text-muted-foreground" data-testid="status-bot-username">
                      ربات @{botStatus.botUsername} {isRunning ? "در حال کار است" : "خاموش است"}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={!isRunning || stopBot.isPending}
                  onClick={handleStop}
                  data-testid="button-stop-bot"
                  className="w-24"
                >
                  {stopBot.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Square className="w-4 h-4 ml-2" /> توقف</>}
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  disabled={!isRunning || restartBot.isPending}
                  onClick={handleRestart}
                  data-testid="button-restart-bot"
                  className="w-28"
                >
                  {restartBot.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4 ml-2" /> راه‌اندازی مجدد</>}
                </Button>
              </div>
            </div>

            <CardContent className="p-6 md:p-8">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="token"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-primary" />
                            توکن ربات
                          </FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="123456789:ABCdefGHIjkl..." 
                              className="font-mono text-left" 
                              dir="ltr"
                              data-testid="input-bot-token"
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>توکن دریافتی از @BotFather</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adminId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <User className="w-4 h-4 text-primary" />
                            شناسه ادمین (Admin ID)
                          </FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="12345678" 
                              className="font-mono text-left"
                              dir="ltr"
                              data-testid="input-admin-id"
                              {...field} 
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription>شناسه عددی اکانت تلگرام شما</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator className="my-4 bg-border/50" />

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                      <Settings className="w-4 h-4" />
                      تنظیمات پیشرفته
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="maxFileSizeMb"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>حداکثر حجم فایل (مگابایت)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                className="font-mono text-left"
                                dir="ltr"
                                data-testid="input-max-file-size"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="rateLimitRequests"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>محدودیت درخواست (در دقیقه)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                className="font-mono text-left"
                                dir="ltr"
                                data-testid="input-rate-limit"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="pt-6">
                    <Button 
                      type="submit" 
                      className="w-full h-12 text-base font-medium shadow-lg"
                      disabled={setupBot.isPending}
                      data-testid="button-submit-setup"
                    >
                      {setupBot.isPending ? (
                        <><RefreshCw className="w-5 h-5 ml-2 animate-spin" /> در حال ذخیره و راه‌اندازی...</>
                      ) : (
                        <><Play className="w-5 h-5 ml-2 fill-current" /> ذخیره تنظیمات و استارت ربات</>
                      )}
                    </Button>
                  </div>

                </form>
              </Form>
            </CardContent>
          </Card>
        </motion.section>

      </div>

      {/* 5. Footer */}
      <footer className="border-t border-border mt-32 bg-card/30">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-primary font-bold text-lg">
            <Bot className="w-6 h-6" />
            <span>مدیا دانلودر</span>
          </div>
          <p className="text-sm text-muted-foreground">
            ساخته شده با افتخار برای کاربران تلگرام. © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
