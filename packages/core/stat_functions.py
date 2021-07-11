import pprint
pp = pprint.PrettyPrinter(indent=4)
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from collections import defaultdict
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import numpy as np
import pandas as pd
import io
import requests
import sys
import time
import os
import tqdm



def analyse_stock(df, return_period, verbose = False):

    """
    Input:  df = n x 1 dataframe with index as date and column as close price of a stock
            return_period = size of sliding window to calculate return
    
    Output: avg_return = average return performance of stock
            dev_return = deviation of list of returns of stock for a set period of time
            results = [timestamps of return calculation, % return corresponding to timestamp]
    """

    df = df.sort_index()
    start_date = df.index.min()
    end_date = df.index.max()

    df = df.reset_index()
    
    pct_return_after_period = []
    buy_dates = []

    for i, row in df.iterrows():

        buy_date = row['Date']
        buy_price = df[df.index == i].iloc[:,1].iloc[0]
        sell_date = buy_date + timedelta(weeks = return_period)
        
        try:
            sell_price = df[df.Date == sell_date].iloc[:,1].iloc[0]
        
        except IndexError:
            continue

        pct_return = (sell_price - buy_price)/buy_price
        pct_return_after_period.append(pct_return)
        buy_dates.append(buy_date)

        if verbose:

            print('Date Buy: %s, Price Buy: %s'%(buy_date,round(buy_price,2)))
            print('Date Sell: %s, Price Sell: %s'%(sell_date,round(sell_price,2)))
            print('Return: %s%%'%round(pct_return*100,1))
            print('-------------------')

    return np.mean(pct_return_after_period), np.std(pct_return_after_period), [buy_dates, pct_return_after_period]
